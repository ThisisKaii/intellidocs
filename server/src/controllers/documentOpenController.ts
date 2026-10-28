import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import * as documentOpenModel from '../models/documentOpenModel'

/**
 * Remember that the caller opened a document (feeds "Recent"). Best effort: a document the caller
 * cannot read, or a database without migration 034, is ignored so opening a document never fails.
 */
export async function markOpened(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      await documentModel.getDocumentForUser(req.params.id, userId, req.user?.email)
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      if (status === 403 || status === 404) {
        res.status(204).end()
        return
      }
      throw error
    }
    await documentOpenModel.recordOpen(userId, req.params.id)
    res.status(204).end()
  } catch (error) {
    if (error instanceof documentOpenModel.RecentUnavailableError) {
      res.status(204).end()
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to record document open' })
  }
}

/** The documents the caller opened in the last 7 days, most recently opened first. */
export async function listRecent(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json(await documentOpenModel.listRecentDocuments(userId))
  } catch (error) {
    if (error instanceof documentOpenModel.RecentUnavailableError) {
      res.status(503).json({ error: error.message, code: 'recent_unavailable' })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load recent documents' })
  }
}
