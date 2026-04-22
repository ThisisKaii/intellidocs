import { Request, Response } from 'express'
import { predictFormat } from '../skills/predictFormat'
import {
  requestGrammarCheck,
  requestSpellingCheck,
} from '../ai/bridge/pythonBridge'
import {
  cacheSuggestion,
  getCachedSuggestion,
} from '../models/aiCacheModel'
import { consumeAIQuota } from '../models/aiQuotaModel'

interface TextBody {
  text?: string
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

    const allowed = await enforceQuota(userId, 'predict', res)
    if (!allowed) {
      return
    }

    try {
      const cached = await getCachedSuggestion(userId, text)

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

    const prediction = await predictFormat({ text })

    try {
      await cacheSuggestion(userId, text, {
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

    const text = getText(req.body as TextBody, res)
    if (!text) {
      return
    }

    const allowed = await enforceQuota(userId, 'grammar-check', res)
    if (!allowed) {
      return
    }

    const result = await requestGrammarCheck(text)
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

    const text = getText(req.body as TextBody, res)
    if (!text) {
      return
    }

    const allowed = await enforceQuota(userId, 'spelling-check', res)
    if (!allowed) {
      return
    }

    const result = await requestSpellingCheck(text)
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Spelling check failed'
    res.status(500).json({ error: message })
  }
}
