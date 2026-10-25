import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as behaviorModel from '../models/behaviorModel'
import * as folderModel from '../models/folderModel'
import * as documentModel from '../models/documentModel'
import * as plagiarismModel from '../models/plagiarismModel'
import type { PlagiarismScope, ScanDocument } from '../models/plagiarismModel'
import { runCouncilScan } from '../skills/runCouncilScan'
import { runOriginalityCheck } from '../skills/runOriginalityCheck'
import { reviewOriginalityWithCouncil } from '../skills/reviewOriginalityWithCouncil'
import { consumeAIQuota } from '../models/aiQuotaModel'

/** True when the user owns the folder (folderModel throws otherwise). */
async function ownsFolder(userId: string, folderId: string): Promise<boolean> {
  try {
    await folderModel.getFolderById(userId, folderId)
    return true
  } catch {
    return false
  }
}

/** Map a folder lookup failure to 404; everything else is a 500. */
function errorStatus(err: unknown): number {
  const status = (err as Error & { status?: number }).status
  if (typeof status === 'number') return status
  if (err instanceof Error && err.message === 'Folder not found') return 404
  return 500
}

/** Run a council scan for one submission in the professor's class folder. */
export async function runScan(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, folderId, scope } = req.body as { documentId: string; folderId: string; scope: PlagiarismScope }

    const folder = await folderModel.getFolderById(userId, folderId)
    if (folder.folder_type !== 'class') {
      res.status(400).json({ error: 'Scans are only available for class folders' })
      return
    }

    const document = await plagiarismModel.getFolderDocument(folderId, documentId)
    // Global scans compare against every class this professor owns, so a copy
    // from another class is found too; local scans stay inside this folder.
    const peers: Array<ScanDocument & { folder_id?: string }> =
      scope === 'global'
        ? await plagiarismModel.getProfessorPeerDocuments(userId, documentId)
        : await plagiarismModel.getFolderPeerDocuments(folderId, documentId)
    const folderByDocument = new Map(peers.map((peer) => [peer.id, peer.folder_id ?? folderId]))
    // The author's composition timeline feeds the forensics verdicts. Reading
    // fails open (empty timeline) when Redis is unavailable.
    const timeline = await behaviorModel.getBehaviorEvents(document.user_id, documentId)

    const result = await runCouncilScan({ documentId, folderId, document, peers, timeline })

    const scan = await plagiarismModel.createScan({
      documentId,
      userId: document.user_id,
      folderId,
      overallOriginalityScore: result.overall_originality_score,
      peerSimilarityScore: result.peer_similarity_score,
      externalSimilarityScore: 0,
      activeJudgesCount: result.active_judges,
      quorumReached: result.quorum_reached,
      councilTranscript: result.transcript,
      status: 'completed',
      scope,
    })

    const matches = await plagiarismModel.createMatches(
      scan.scan_id,
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

    res.status(201).json({ scan, matches, documentTitle: document.title })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run scan'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Compare the student's own document with their other documents; nothing is stored. */
export async function selfCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId } = req.body as { documentId: string }
    const document = await documentModel.getDocumentById(documentId, userId)
    const others = await plagiarismModel.getOwnOtherDocuments(userId, documentId)

    const result = await runOriginalityCheck({
      document: { id: document.id, title: document.title, content: document.content },
      others,
    })
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check originality'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Ask the AI judges to review the student's overlapping passages (quota-limited, nothing stored). */
export async function selfCheckReview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const quota = await consumeAIQuota(userId, 'plagiarism-review')
    if (!quota.allowed) {
      res.status(429).json({ error: 'AI review limit reached. Try again in a minute.' })
      return
    }

    const { documentId } = req.body as { documentId: string }
    const document = await documentModel.getDocumentById(documentId, userId)
    const others = await plagiarismModel.getOwnOtherScanDocuments(userId, documentId)
    if (others.length === 0) {
      res.json({ reviews: [], activeJudges: 0 })
      return
    }

    const result = await reviewOriginalityWithCouncil({
      document: { id: document.id, user_id: userId, title: document.title, content: document.content },
      others,
    })
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review originality'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Fetch one scan with its flagged matches (owner or class-folder professor). */
export async function getScan(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const scan = await plagiarismModel.getScanById(req.params.id)
    if (!scan) {
      res.status(404).json({ error: 'Scan not found' })
      return
    }

    const canRead =
      scan.user_id === userId ||
      (scan.folder_id ? await ownsFolder(userId, scan.folder_id) : false)
    if (!canRead) {
      res.status(403).json({ error: 'You do not have access to this scan' })
      return
    }

    const [matches, documentTitle] = await Promise.all([
      plagiarismModel.getMatchesForScan(scan.scan_id),
      plagiarismModel.getDocumentTitle(scan.document_id),
    ])

    res.json({ scan, matches, documentTitle })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load scan'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** List the scans recorded for one of the professor's class folders. */
export async function listFolderScans(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const folderId = req.params.id
    const folder = await folderModel.getFolderById(userId, folderId)
    if (folder.folder_type !== 'class') {
      res.status(400).json({ error: 'Scans are only available for class folders' })
      return
    }

    const scans = await plagiarismModel.listScansForFolder(folderId)
    res.json(scans)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list scans'
    res.status(errorStatus(err)).json({ error: message })
  }
}
