import {
  requestFormatPrediction,
  type IsolationMode,
} from '../ai/bridge/pythonBridge'
import { matchLearnedFormat } from './matchLearnedFormat'
import type { LearnedFormatMatch } from '../types/index'

export interface PredictFormatInput {
  text: string
  fontSize?: number
  isBold?: boolean
  isItalic?: boolean
  xPosition?: number
  userId?: string
  isolationMode?: IsolationMode
}

export interface PredictFormatResult {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
  isolationMode: string
  learned?: LearnedFormatMatch
}

// Predict the next format for the given text. The user's learned text→format
// memory (from behavior events across documents) takes priority over the ML
// prediction when it contains a match for the current text.
export async function predictFormat(
  input: PredictFormatInput
): Promise<PredictFormatResult> {
  const text = input.text.trim()

  if (!text) {
    throw new Error('Prediction text is required')
  }

  const learned = await matchLearnedFormat(input.userId, text)
  if (learned) {
    return {
      predictedFormat: 'learned',
      confidence: learned.confidence,
      featureValues: {},
      isolationMode: 'learned',
      learned,
    }
  }

  const result = await requestFormatPrediction(text, {
    fontSize: input.fontSize,
    isBold: input.isBold,
    isItalic: input.isItalic,
    xPosition: input.xPosition,
    userId: input.userId,
    isolationMode: input.isolationMode,
  })

  return {
    predictedFormat: result.predictedFormat,
    confidence: result.confidence,
    featureValues: result.featureValues,
    isolationMode: result.isolationMode,
  }
}