import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import * as documentPinModel from '../models/documentPinModel'

/** Error status a model attached (403 no access, 404 missing), if any. */
function statusOf(error: unknown): number | undefined {
  return (error as Error & { status?: number }).status
}

/** Pin a document for the caller: their own, or one shared with them. */
export async function pin(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      await documentModel.getDocumentForUser(req.params.id, userId, req.user?.email)
    } catch (error) {
      const status = statusOf(error)
      if (status === 403 || status === 404) {
        res.status(status).json({ error: status === 404 ? 'Document not found' : 'You cannot open this document' })
        return
      }
      throw error
    }
    await documentPinModel.pinDocument(userId, req.params.id)
    res.status(204).end()
  } catch (error) {
    if (error instanceof documentPinModel.PinsUnavailableError) {
      res.status(503).json({ error: error.message, code: 'pins_unavailable' })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to pin document' })
  }
}

/** Remove the caller's own pin (no access check: it only deletes their row). */
export async function unpin(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    await documentPinModel.unpinDocument(userId, req.params.id)
    res.status(204).end()
  } catch (error) {
    if (error instanceof documentPinModel.PinsUnavailableError) {
      res.status(503).json({ error: error.message, code: 'pins_unavailable' })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unpin document' })
  }
}

/** The caller's pinned documents, most recently pinned first. */
export async function listPinned(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json(await documentPinModel.listPinnedDocuments(userId))
  } catch (error) {
    if (error instanceof documentPinModel.PinsUnavailableError) {
      res.status(503).json({ error: error.message, code: 'pins_unavailable' })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load pinned documents' })
  }
}
