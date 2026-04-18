import axios from 'axios'

export interface PredictionRequest {
  text: string
}

export interface PredictionResponse {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
}

/** Send a formatting prediction request to the FastAPI service. */
export async function requestFormatPrediction(
  text: string
): Promise<PredictionResponse> {
  const mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000'

  try {
    const response = await axios.post<{
      predicted_format: string
      confidence: number
      feature_values?: Record<string, number>
    }>(
      `${mlApiUrl}/predict`,
      { text },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    )

    return {
      predictedFormat: response.data.predicted_format,
      confidence: response.data.confidence,
      featureValues: response.data.feature_values ?? {},
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail =
        typeof error.response?.data === 'object' &&
        error.response?.data !== null &&
        'detail' in error.response.data
          ? String(error.response.data.detail)
          : error.message

      throw new Error(`Python bridge prediction failed: ${detail}`)
    }

    throw new Error('Python bridge prediction failed.')
  }
}