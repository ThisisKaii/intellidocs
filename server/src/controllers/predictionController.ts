import { Request, Response } from 'express'
import { predictFormat } from '../skills/predictFormat'
import {
  requestGrammarCheck,
  requestSpellingCheck,
} from '../ai/bridge/pythonBridge'

// Handle formatting prediction requests using the ML prediction skill.
export async function predictFormatting(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { text } = req.body as { text?: string }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required' })
      return
    }

    const prediction = await predictFormat({ text })

    res.status(200).json({
      predicted_format: prediction.predictedFormat,
      confidence: prediction.confidence,
      feature_values: prediction.featureValues,
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
    const { text } = req.body as { text?: string }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required' })
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
    const { text } = req.body as { text?: string }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required' })
      return
    }

    const result = await requestSpellingCheck(text)
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Spelling check failed'
    res.status(500).json({ error: message })
  }
}
