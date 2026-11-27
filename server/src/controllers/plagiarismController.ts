import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as folderModel from '../models/folderModel'
import * as documentModel from '../models/documentModel'
import * as plagiarismModel from '../models/plagiarismModel'
import type { GlobalScopeFilters, PlagiarismScope } from '../models/plagiarismModel'
import { processCouncilScan } from '../skills/processCouncilScan'
import { runOriginalityCheck } from '../skills/runOriginalityCheck'
import { runWebOriginalityCheck } from '../skills/runWebOriginalityCheck'
import { allowAttempt } from '../utils/attemptLimit'
import { reviewOriginalityWithCouncil } from '../skills/reviewOriginalityWithCouncil'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { sliceDocumentContent } from '../utils/webText'
import type { WebCheckPayload } from '../../schemas/plagiarismSchemas'
import { documentBody } from '../models/documentTabModel'
import { htmlWordCount } from '../utils/documentGuards'
import * as webCheckJobModel from '../models/webCheckJobModel'

/** Fewest words a submission needs for a council scan. */
const MIN_SCAN_WORDS = 50

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

/**
 * Start a council scan of one submission in the professor's class folder. The scan is recorded as
 * `running` and answered at once (202); the judges deliberate in the background
 * (processCouncilScan), and the professor is notified when it is done. GET /scans/:id reads it.
 */
export async function runScan(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, folderId, scope, filters } = req.body as {
      documentId: string
      folderId: string
      scope: PlagiarismScope
      filters?: GlobalScopeFilters
    }

    const folder = await folderModel.getFolderById(userId, folderId)
    if (folder.folder_type !== 'class') {
      res.status(400).json({ error: 'Scans are only available for class folders' })
      return
    }

    const document = await plagiarismModel.getFolderDocument(folderId, documentId)
    // The council compares passages; with almost no text there is nothing to judge.
    if (htmlWordCount(document.content) < MIN_SCAN_WORDS) {
      res.status(400).json({ error: `The document must contain at least ${MIN_SCAN_WORDS} words to scan.`, code: 'document_too_short' })
      return
    }
    const scan = await plagiarismModel.createScan({
      documentId,
      userId: document.user_id,
      folderId,
      overallOriginalityScore: 0,
      peerSimilarityScore: 0,
      externalSimilarityScore: 0,
      activeJudgesCount: 0,
      quorumReached: false,
      // The transcript column is required; it stays empty until the council has deliberated.
      councilTranscript: [],
      status: 'running',
      scope,
    })

    void processCouncilScan({ scanId: scan.scan_id, requesterId: userId, documentId, folderId, scope, filters, document })

    res.status(202).json({ scanId: scan.scan_id, status: 'running', scan, matches: [], documentTitle: document.title })
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
      document: { id: document.id, title: document.title, content: await documentBody(document) },
      others,
    })
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check originality'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Online checks one person may run per hour; each one uses a few searches from a limited free allowance. */
const WEB_CHECKS_PER_HOUR = 10

/** Compare the document with the web and scholarly sources; nothing is stored. Supports optional targeted scope (chapter or page range). */
export async function webCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, scope = 'all', chapterTitle, pageStart, pageEnd } = req.body as WebCheckPayload
    const document = await documentModel.getDocumentById(documentId, userId)

    if (!(await allowAttempt(`web-check:${userId}`, WEB_CHECKS_PER_HOUR, 3600))) {
      res.status(429).json({ error: `You can run ${WEB_CHECKS_PER_HOUR} online checks per hour. Try again later.` })
      return
    }

    const contentToCheck = sliceDocumentContent(await documentBody(document), { scope, chapterTitle, pageStart, pageEnd })

    res.json(await runWebOriginalityCheck({ documentHtml: contentToCheck }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check originality online'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/**
 * Start an async online originality check and return a 202 job handle right away so users can
 * navigate back to the editor (or anywhere else) while the check runs on the server.
 */
export async function startWebCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, scope = 'all', chapterTitle, pageStart, pageEnd } = req.body as WebCheckPayload
    const document = await documentModel.getDocumentById(documentId, userId)

    if (!(await allowAttempt(`web-check:${userId}`, WEB_CHECKS_PER_HOUR, 3600))) {
      res.status(429).json({ error: `You can run ${WEB_CHECKS_PER_HOUR} online checks per hour. Try again later.` })
      return
    }

    const contentToCheck = sliceDocumentContent(await documentBody(document), { scope, chapterTitle, pageStart, pageEnd })
    const scopeLabel = webCheckJobModel.formatWebCheckScopeLabel({ scope, chapterTitle, pageStart, pageEnd })
    const job = webCheckJobModel.createWebCheckJob({ userId, documentId, scopeLabel })

    void runWebOriginalityCheck({ documentHtml: contentToCheck })
      .then((result) => {
        webCheckJobModel.completeWebCheckJob(job.jobId, result)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to check originality online'
        webCheckJobModel.failWebCheckJob(job.jobId, message)
      })

    res.status(202).json(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check originality online'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Return the status (and completed result, if ready) of a user's async web originality check. */
export async function getWebCheckJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const jobId = String(req.params.jobId ?? '')
    const job = webCheckJobModel.getWebCheckJob(jobId, userId)
    if (!job) {
      res.status(404).json({ error: 'Originality check job not found' })
      return
    }
    res.json(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load originality check'
    res.status(errorStatus(err)).json({ error: message })
  }
}

/** Return the latest async web originality job for a document, or `{ job: null }` if none. */
export async function getLatestDocumentWebCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const documentId = String(req.params.documentId ?? '')
    await documentModel.getDocumentById(documentId, userId)
    const job = webCheckJobModel.getLatestWebCheckJobForDocument(userId, documentId)
    res.json({ job })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load originality check'
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
      document: { id: document.id, user_id: userId, title: document.title, content: await documentBody(document) },
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
