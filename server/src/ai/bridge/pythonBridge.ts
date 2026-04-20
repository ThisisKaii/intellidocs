import axios from 'axios'

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

  const response = await axios.post<{
    predicted_format: string
    confidence: number
    feature_values?: Record<string, number>
  }>(`${mlApiUrl}/predict`, { text })

  return {
    predictedFormat: response.data.predicted_format,
    confidence: response.data.confidence,
    featureValues: response.data.feature_values ?? {},
  }
}

/** Send a grammar check request to the FastAPI service. */
export async function requestGrammarCheck(
  text: string
): Promise<GrammarCheckResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  const response = await axios.post<GrammarCheckResponse>(
    `${mlApiUrl}/grammar/check`,
    { text }
  )

  return response.data
}

/** Send a spelling check request to the FastAPI service. */
export async function requestSpellingCheck(
  text: string
): Promise<SpellingCheckResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  const response = await axios.post<SpellingCheckResponse>(
    `${mlApiUrl}/spelling/check`,
    { text }
  )

  return response.data
}
