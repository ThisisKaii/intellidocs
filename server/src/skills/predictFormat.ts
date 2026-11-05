import {
  requestFormatPrediction,
  type IsolationMode,
} from '../ai/bridge/pythonBridge'
import { matchLearnedFormat } from './matchLearnedFormat'
import type { DocumentGenre, LearnedFormatMatch } from '../types/index'

export interface PredictFormatInput {
  text: string
  /** Genre partition: only this genre's learned patterns and user model are consulted. */
  genre: DocumentGenre
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
  /** True when the genre's personal data (learned map or user model) produced the answer. */
  genrePartitionHit: boolean
  learned?: LearnedFormatMatch
}

// Predict the next format for the given text within one genre partition. The user's
// learned text→format memory (from documents of the same genre) takes priority over the
// ML prediction when it contains a match for the current text.
export async function predictFormat(
  input: PredictFormatInput
): Promise<PredictFormatResult> {
  const text = input.text.trim()

  if (!text) {
    throw new Error('Prediction text is required')
  }

  const learned = await matchLearnedFormat(input.userId, input.genre, text)
  if (learned) {
    return {
      predictedFormat: 'learned',
      confidence: learned.confidence,
      featureValues: {},
      isolationMode: 'learned',
      genrePartitionHit: true,
      learned,
    }
  }

  const result = await requestFormatPrediction(text, {
    genre: input.genre,
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
    genrePartitionHit: result.genrePartitionHit,
  }
}