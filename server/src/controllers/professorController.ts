import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as professorModel from '../models/professorModel'
import * as notificationModel from '../models/notificationModel'
import * as documentModel from '../models/documentModel'
import { auditCompliance } from '../skills/auditCompliance'

export async function addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { documentId, comment, highlightedText } = req.body
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
    const documentId = req.params.id
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

    const { documentId, studentId, grade, notes } = req.body

    // Submit grade review
    const review = await professorModel.submitGrade(
      documentId,
      reviewerId,
      studentId,
      grade,
      notes
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
    const documentId = req.params.id
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
