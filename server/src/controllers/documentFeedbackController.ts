import { Request, Response } from 'express'
import * as professorModel from '../models/professorModel'
import * as folderModel from '../models/folderModel'
import { DEFAULT_CLASS_RUBRIC } from '../types/index'

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


/**
 * The rubric a submission is graded with: its class's own rubric, else the default.
 * Readable by the document's owner and by a professor it was handed in to.
 */
export async function getRubric(req: Request, res: Response): Promise<void> {
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
      res.status(403).json({ error: 'You cannot see the rubric of this document' })
      return
    }
    const classFolderId = await folderModel.getClassFolderOfDocument(documentId)
    const rubric = classFolderId ? await folderModel.getClassRubric(classFolderId) : null
    res.json({ rubric: rubric ?? DEFAULT_CLASS_RUBRIC, custom: rubric !== null, classFolderId })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load the rubric' })
  }
}
