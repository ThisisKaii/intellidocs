import { Request, Response } from 'express'
import * as professorModel from '../models/professorModel'

/**
 * A submission's professor feedback: the latest grade (with its rubric) and the
 * comment thread. The document's owner can read it, and so can a professor the
 * document was handed in to; anyone else gets 403.
 */
export async function getFeedback(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const documentId = req.params.id
    const ownerId = await professorModel.getDocumentOwnerId(documentId)
    if (!ownerId) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    if (ownerId !== userId && !(await professorModel.professorCanReview(userId, documentId))) {
      res.status(403).json({ error: 'You cannot see feedback on this document' })
      return
    }
    const [review, comments] = await Promise.all([
      professorModel.getDocumentReview(documentId),
      professorModel.getDocumentComments(documentId),
    ])
    res.json({ review, comments })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load feedback' })
  }
}
