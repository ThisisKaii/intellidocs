import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as professorModel from '../models/professorModel'
import * as notificationModel from '../models/notificationModel'
import * as documentModel from '../models/documentModel'
import * as folderModel from '../models/folderModel'
import * as plagiarismModel from '../models/plagiarismModel'
import { auditCompliance } from '../skills/auditCompliance'
import { similarityQuerySchema } from '../../schemas/plagiarismSchemas'
import type { AddCommentInput, SubmitGradeInput } from '../../schemas/professorSchemas'

/**
 * Send 403 unless the document was handed in to one of this professor's
 * classes. Returns true when the request may go on.
 */
async function ensureCanReview(professorId: string, documentId: string, res: Response): Promise<boolean> {
  if (await professorModel.professorCanReview(professorId, documentId)) return true
  res.status(403).json({ error: 'This document was not submitted to one of your classes' })
  return false
}

export async function addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, comment, highlightedText } = req.body as AddCommentInput
    if (!(await ensureCanReview(userId, documentId, res))) return
    const commentRecord = await professorModel.addComment(
      documentId,
      userId,
      comment,
      highlightedText
    )

    res.status(201).json(commentRecord)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add comment'
    res.status(500).json({ error: message })
  }
}

export async function getDocumentComments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const documentId = req.params.id
    if (!(await ensureCanReview(userId, documentId, res))) return
    const comments = await professorModel.getDocumentComments(documentId)
    res.json(comments)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch comments'
    res.status(500).json({ error: message })
  }
}

export async function submitGrade(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const reviewerId = req.user?.id
    if (!reviewerId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, studentId, grade, notes, rubric } = req.body as SubmitGradeInput
    if (!(await ensureCanReview(reviewerId, documentId, res))) return
    // The grade goes to the document's owner, never to an id the client made up.
    if ((await professorModel.getDocumentOwnerId(documentId)) !== studentId) {
      res.status(400).json({ error: 'That student does not own this document' })
      return
    }

    // Submit grade review
    const review = await professorModel.submitGrade(
      documentId,
      reviewerId,
      studentId,
      grade,
      notes,
      rubric
    )

    // Trigger notification to student
    try {
      await notificationModel.createNotification(
        studentId,
        'grade_submitted',
        'Grade Submitted',
        `Your document has been graded: ${grade}/100.`,
        { documentId, grade, notes }
      )
    } catch (notifErr) {
      console.error('⚠️ Notification trigger warning:', notifErr)
    }

    res.status(201).json(review)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit grade'
    res.status(500).json({ error: message })
  }
}

export async function getDocumentReview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const documentId = req.params.id
    if (!(await ensureCanReview(userId, documentId, res))) return
    const review = await professorModel.getDocumentReview(documentId)
    res.json(review)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch review'
    res.status(500).json({ error: message })
  }
}

export async function runComplianceAudit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const reviewerId = req.user?.id
    if (!reviewerId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const {
      documentId,
      mandatoryHeadings,
      referenceStyle,
      requiredMarginInches,
      referencesRequired,
    } = req.body

    // The document is loaded here so the client never posts its content back
    // to the server, and access is checked before any ML work is spent.
    const document = await documentModel.getDocumentForUser(
      documentId,
      reviewerId,
      req.user?.email
    )

    const report = await auditCompliance({
      content: document.content,
      pageSetup: {
        margins: document.margins,
        showHeader: document.show_header,
        showFooter: document.show_footer,
        headerNumberFormat: document.header_number_format,
        footerNumberFormat: document.footer_number_format,
      },
      requirements: {
        mandatoryHeadings,
        referenceStyle,
        requiredMarginInches,
        referencesRequired,
      },
    })

    res.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run compliance audit'
    res.status(500).json({ error: message })
  }
}

/**
 * Return the class similarity matrix for one of the professor's class folders.
 * Ownership is checked first, so a professor can only compare submissions in
 * their own folders.
 */
export async function getFolderSimilarity(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const folderId = req.params.id
    const folder = await folderModel.getFolderById(userId, folderId)
    if (folder.folder_type !== 'class') {
      res.status(400).json({ error: 'Similarity analysis is only available for class folders' })
      return
    }

    const query = similarityQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(400).json({ error: 'Invalid similarity filters' })
      return
    }
    const { scope, terms, classCodes, includePast } = query.data
    const list = (value: string | undefined): string[] => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    // The global view can be narrowed to some terms or class codes, or to this class's term only.
    const globalFolderIds =
      scope === 'global'
        ? await plagiarismModel.getProfessorClassScope(userId, folderId, {
            academicTerms: list(terms),
            classCodes: list(classCodes),
            includePastTerms: includePast !== 'false',
          })
        : undefined
    const matrix = await plagiarismModel.getClassSimilarity(folderId, scope, globalFolderIds)
    res.json(matrix)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load similarity matrix'
    if (message === 'Folder not found') {
      res.status(404).json({ error: message })
      return
    }
    res.status(500).json({ error: message })
  }
}
