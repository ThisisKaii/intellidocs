import axios from 'axios'
import {
  pythonGrammarCheckResponseSchema,
  pythonPredictionResponseSchema,
  pythonSpellingCheckResponseSchema,
  type PythonGrammarCheckResponse,
  type PythonPredictionResponse,
  type PythonSpellingCheckResponse,
} from '../../../schemas/predictionSchemas'

export interface PredictionResponse {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
}

export interface GrammarIssue {
  type: string
  original: string
  suggestion: string
  explanation: string
}

export interface GrammarCheckResponse {
  score: number
  status: string
  message: string
  issues: GrammarIssue[]
}

export interface SpellingIssue {
  word: string
  suggestion: string | null
  type: string
}

export interface SpellingCheckResponse {
  issues: SpellingIssue[]
  count: number
  message: string
}

/** Send a formatting prediction request to the FastAPI service. */
export async function requestFormatPrediction(
  text: string
): Promise<PredictionResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  const response = await axios.post<PythonPredictionResponse>(
    `${mlApiUrl}/predict`,
    { text }
  )
  const data = pythonPredictionResponseSchema.parse(response.data)

  return {
    predictedFormat: data.predicted_format,
    confidence: data.confidence,
    featureValues: data.feature_values ?? {},
  }
}

/** Send a grammar check request to the FastAPI service. */
export async function requestGrammarCheck(
  text: string
): Promise<GrammarCheckResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  const response = await axios.post<PythonGrammarCheckResponse>(
    `${mlApiUrl}/grammar/check`,
    { text }
  )

  return pythonGrammarCheckResponseSchema.parse(response.data)
}

/** Send a spelling check request to the FastAPI service. */
export async function requestSpellingCheck(
  text: string
): Promise<SpellingCheckResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  const response = await axios.post<PythonSpellingCheckResponse>(
    `${mlApiUrl}/spelling/check`,
    { text }
  )

  return pythonSpellingCheckResponseSchema.parse(response.data)
}
