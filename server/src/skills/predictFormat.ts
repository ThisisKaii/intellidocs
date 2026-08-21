import { requestFormatPrediction } from '../ai/bridge/pythonBridge'

export interface PredictFormatInput {
  text: string
  fontSize?: number
  isBold?: boolean
  isItalic?: boolean
  xPosition?: number
  userId?: string
}

export interface PredictFormatResult {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
}

// Request a formatting prediction from the Python ML service.
export async function predictFormat(
  input: PredictFormatInput
): Promise<PredictFormatResult> {
  const text = input.text.trim()

  if (!text) {
    throw new Error('Prediction text is required')
  }

  const result = await requestFormatPrediction(text, {
    fontSize: input.fontSize,
    isBold: input.isBold,
    isItalic: input.isItalic,
    xPosition: input.xPosition,
    userId: input.userId,
  })

  return {
    predictedFormat: result.predictedFormat,
    confidence: result.confidence,
    featureValues: result.featureValues,
  }
}