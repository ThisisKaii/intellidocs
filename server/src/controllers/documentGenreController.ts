import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { classifyDocumentGenre } from '../skills/classifyDocumentGenre'
import { resolveDocumentGenre } from '../utils/documentGenre'
import type { DocumentGenre } from '../types/index'
import type { GenreSignalsInput } from '../../schemas/genreSchemas'

/** Send a model error with its status (404 for documents the caller does not own). */
function sendError(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback
  const status = (error as Error & { status?: number }).status ?? 500
  res.status(status).json({ error: message })
}

/**
 * Classify a document's genre from editor-extracted structure. The result is stored only while
 * the document is in auto mode; a manual choice is reported back unchanged.
 */
export async function detectGenre(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const { signals } = req.body as { signals: GenreSignalsInput }
    const doc = await documentModel.getDocumentById(id, userId)
    const classification = classifyDocumentGenre(signals)

    if (doc.genre_source === 'manual') {
      res.status(200).json({ genre: resolveDocumentGenre(doc), genreSource: 'manual', confidence: 1, reasons: ['Set manually'] })
      return
    }

    const saved = await documentModel.setDocumentGenre(id, userId, classification.genre, 'auto')
    res.status(200).json({
      genre: saved.genre,
      genreSource: saved.genre_source,
      confidence: classification.confidence,
      reasons: classification.reasons,
    })
  } catch (error) {
    sendError(res, error, 'Genre detection failed')
  }
}

/** Manually override a document's genre, or (genre: null) return it to auto-detection. */
export async function setGenre(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const { genre } = req.body as { genre: DocumentGenre | null }
    const doc = await documentModel.getDocumentById(id, userId)

    const saved = genre
      ? await documentModel.setDocumentGenre(id, userId, genre, 'manual')
      : await documentModel.setDocumentGenre(id, userId, resolveDocumentGenre({ formatting_preset: doc.formatting_preset }), 'auto')

    res.status(200).json({ genre: saved.genre, genreSource: saved.genre_source })
  } catch (error) {
    sendError(res, error, 'Genre update failed')
  }
}
