import * as behaviorModel from '../models/behaviorModel'
import * as notificationModel from '../models/notificationModel'
import * as plagiarismModel from '../models/plagiarismModel'
import type { GlobalScopeFilters, PlagiarismScope, ScanDocument } from '../models/plagiarismModel'
import { runCouncilScan } from './runCouncilScan'

/** What a background council scan needs: the scan row already created as `running`. */
export interface CouncilScanJob {
  scanId: string
  /** The professor who started the scan: told when it is done. */
  requesterId: string
  documentId: string
  folderId: string
  scope: PlagiarismScope
  filters?: GlobalScopeFilters
  document: ScanDocument
}

/**
 * Run a council scan after its request has been answered (the five judges take 20–45 s): compare
 * the submission with its peers, record the verdict and the matches on the `running` scan, and
 * notify the professor who started it. A failure marks the scan `failed` and says so instead.
 */
export async function processCouncilScan(job: CouncilScanJob): Promise<void> {
  const { scanId, requesterId, documentId, folderId, scope, filters, document } = job
  try {
    // Global scans compare against every class this professor owns, so a copy
    // from another class is found too; local scans stay inside this folder.
    const peers: Array<ScanDocument & { folder_id?: string }> =
      scope === 'global'
        ? await plagiarismModel.getProfessorPeerDocuments(
            await plagiarismModel.getProfessorClassScope(requesterId, folderId, filters),
            documentId,
          )
        : await plagiarismModel.getFolderPeerDocuments(folderId, documentId)
    const folderByDocument = new Map(peers.map((peer) => [peer.id, peer.folder_id ?? folderId]))
    // The author's composition timeline feeds the forensics verdicts. Reading
    // fails open (empty timeline) when Redis is unavailable.
    const timeline = await behaviorModel.getBehaviorEvents(document.user_id, documentId)

    const result = await runCouncilScan({ documentId, folderId, document, peers, timeline })

    await plagiarismModel.createMatches(
      scanId,
      result.matches.map((match) => {
        // Store the forensics payload alongside the council verdict (jsonb)
        // and mirror the concrete verdict into its own column.
        const mergedVerdict =
          match.council_verdict || match.forensics
            ? { ...(match.council_verdict ?? {}), forensics: match.forensics ?? null }
            : null
        return {
          paragraphIndex: match.paragraph_index,
          charStart: match.char_start,
          charEnd: match.char_end,
          matchedDocumentId: match.matched_document_id ?? null,
          matchedStudentId: match.matched_student_id ?? null,
          matchedFolderId: match.matched_document_id ? folderByDocument.get(match.matched_document_id) ?? null : null,
          similarityScore: match.similarity_score,
          matchType: match.match_type,
          matchSeverity: match.match_severity,
          sourceExcerpt: match.source_excerpt ?? null,
          targetExcerpt: match.target_excerpt ?? null,
          flaggedText: match.flagged_text,
          councilVerdict: mergedVerdict,
          timelineVerdict: match.forensics?.timeline_verdict ?? null,
        }
      }),
    )
    await plagiarismModel.updateScan(scanId, {
      overallOriginalityScore: result.overall_originality_score,
      peerSimilarityScore: result.peer_similarity_score,
      activeJudgesCount: result.active_judges,
      quorumReached: result.quorum_reached,
      councilTranscript: result.transcript,
      status: 'completed',
    })
    await notificationModel
      .createNotification(
        requesterId,
        'plagiarism_scan_complete',
        'Originality Scan Complete',
        `Originality scan for "${document.title}" finished: ${result.overall_originality_score}% original.`,
        { scanId, documentId },
      )
      .catch((error: unknown) => console.warn('Could not notify about a finished scan:', error))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`Council scan ${scanId} failed:`, error)
    await plagiarismModel.updateScan(scanId, { status: 'failed', councilTranscript: { error: reason } }).catch(() => undefined)
    await notificationModel
      .createNotification(
        requesterId,
        'plagiarism_scan_failed',
        'Originality Scan Failed',
        `The originality scan for "${document.title}" could not finish. Run it again.`,
        { scanId, documentId },
      )
      .catch(() => undefined)
  }
}
