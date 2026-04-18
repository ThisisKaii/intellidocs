import { Request, Response } from 'express'
import { predictFormat } from '../skills/predictFormat'

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