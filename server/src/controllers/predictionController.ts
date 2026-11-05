import { Request, Response } from 'express'
import { predictFormat } from '../skills/predictFormat'
import {
  type CheckInput,
  requestGrammarCheck,
  requestSpellingCheck,
} from '../ai/bridge/pythonBridge'
import {
  cacheSuggestion,
  getCachedSuggestion,
} from '../models/aiCacheModel'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { getDocumentForUser } from '../models/documentModel'
import { resolveDocumentGenre } from '../utils/documentGenre'
import type { DocumentGenre } from '../types/index'

interface TextBody {
  text?: string
  isolationMode?: 'baseline' | 'isolated' | 'hybrid'
  documentId?: string
}

/** Read and validate the current user id from the authenticated request. */
function getUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  return userId
}

/** Validate the text payload used by AI-facing prediction endpoints. */
function getText(body: TextBody, res: Response): string | null {
  const text = body.text?.trim()

  if (!text) {
    res.status(400).json({ error: 'Text is required' })
    return null
  }

  return text
}

/** Read the grammar/spell payload (blocks or plain text) already validated by the route. */
function getCheckInput(body: CheckInput): CheckInput {
  const blocks = body.blocks?.filter((block) => block.text.trim().length > 0)
  if (blocks && blocks.length > 0) {
    return { blocks }
  }
  return { text: body.text?.trim() ?? '' }
}

/** Consume a per-user AI quota bucket and return false if the request is blocked. */
async function enforceQuota(
  userId: string,
  scope: string,
  res: Response
): Promise<boolean> {
  try {
    const quota = await consumeAIQuota(userId, scope)

    if (!quota.allowed) {
      res.status(429).json({
        error: 'AI request quota exceeded',
        quota: {
          limit: quota.limit,
          remaining: quota.remaining,
          resetInSeconds: quota.resetInSeconds,
        },
      })
      return false
    }
  } catch (error) {
    console.error('AI quota check failed', error)
  }

  return true
}

// Handle formatting prediction requests using the ML prediction skill.
export async function predictFormatting(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) {
      return
    }

    const text = getText(req.body as TextBody, res)
    if (!text) {
      return
    }

    const { isolationMode, documentId } = req.body as TextBody
    if (!documentId) {
      res.status(400).json({ error: 'documentId is required' })
      return
    }

    // The document decides both the genre partition and whose personalization applies (its
    // owner, so collaborators inherit the document's formatting personality). Neither is
    // taken from the request body.
    let genre: DocumentGenre
    let predictionTargetId: string
    try {
      const doc = await getDocumentForUser(documentId, userId, req.user?.email)
      genre = resolveDocumentGenre(doc)
      predictionTargetId = doc.user_id
    } catch {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    const allowed = await enforceQuota(userId, 'predict', res)
    if (!allowed) {
      return
    }

    try {
      const cached = await getCachedSuggestion(predictionTargetId, genre, text)

      if (cached) {
        res.status(200).json({
          predicted_format: cached.predictedFormat,
          confidence: cached.confidence,
          feature_values: cached.featureValues,
          cached: true,
        })
        return
      }
    } catch (error) {
      console.error('Suggestion cache read failed', error)
    }

    const prediction = await predictFormat({ text, userId: predictionTargetId, genre, isolationMode })

    // Learned text→format match bypasses the (stale) suggestion cache.
    if (prediction.learned) {
      res.status(200).json({
        predicted_format: prediction.learned.format,
        confidence: prediction.learned.confidence,
        feature_values: {},
        isolation_mode: 'learned',
        learned: {
          snippet: prediction.learned.snippet,
          bold: prediction.learned.bold,
          italic: prediction.learned.italic,
          underline: prediction.learned.underline,
          fontSize: prediction.learned.fontSize,
          count: prediction.learned.count,
        },
        cached: false,
      })
      return
    }

    try {
      await cacheSuggestion(predictionTargetId, genre, text, {
        predictedFormat: prediction.predictedFormat,
        confidence: prediction.confidence,
        featureValues: prediction.featureValues,
      })
    } catch (error) {
      console.error('Suggestion cache write failed', error)
    }

    res.status(200).json({
      predicted_format: prediction.predictedFormat,
      confidence: prediction.confidence,
      feature_values: prediction.featureValues,
      isolation_mode: prediction.isolationMode,
      genre,
      genre_partition_hit: prediction.genrePartitionHit,
      cached: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prediction failed'
    res.status(500).json({ error: message })
  }
}

// Handle grammar check requests using the Python bridge.
export async function grammarCheck(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) {
      return
    }

    const input = getCheckInput(req.body as CheckInput)

    const allowed = await enforceQuota(userId, 'grammar-check', res)
    if (!allowed) {
      return
    }

    const result = await requestGrammarCheck(input)
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Grammar check failed'
    res.status(500).json({ error: message })
  }
}

// Handle spelling check requests using the Python bridge.
export async function spellingCheck(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) {
      return
    }

    const input = getCheckInput(req.body as CheckInput)

    const allowed = await enforceQuota(userId, 'spelling-check', res)
    if (!allowed) {
      return
    }

    const result = await requestSpellingCheck(input)
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Spelling check failed'
    res.status(500).json({ error: message })
  }
}
