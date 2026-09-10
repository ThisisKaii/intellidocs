import axios from 'axios'
import {
  pythonConversionResponseSchema,
  pythonGrammarCheckResponseSchema,
  pythonPredictionResponseSchema,
  pythonSpellingCheckResponseSchema,
  type PythonConversionResponse,
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

function getMLApiUrl(): string {
  return process.env.ML_API_URL || process.env.PYTHON_API_URL || 'http://localhost:8000'
}

/** Send a formatting prediction request to the FastAPI service. */
export async function requestFormatPrediction(
  text: string,
  options?: {
    fontSize?: number
    isBold?: boolean
    isItalic?: boolean
    xPosition?: number
    userId?: string
  }
): Promise<PredictionResponse> {
  const mlApiUrl = getMLApiUrl()

  const response = await axios.post<PythonPredictionResponse>(
    `${mlApiUrl}/predict`,
    {
      text,
      user_id: options?.userId,
      font_size: options?.fontSize,
      is_bold: options?.isBold,
      is_italic: options?.isItalic,
      x_position: options?.xPosition,
    }
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
  const mlApiUrl = getMLApiUrl()

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
  const mlApiUrl = getMLApiUrl()

  const response = await axios.post<PythonSpellingCheckResponse>(
    `${mlApiUrl}/spelling/check`,
    { text }
  )

  return pythonSpellingCheckResponseSchema.parse(response.data)
}

export interface PipelineAggregateResponse {
  status: string
  events_inserted: number
}

export interface PipelineExtractResponse {
  status: string
  rows_written: number
}

export interface PipelineExportResponse {
  status: string
  export_dir: string
}

/** Trigger Redis → DuckDB aggregation via the ML FastAPI service. */
export async function requestAggregation(): Promise<PipelineAggregateResponse> {
  const mlApiUrl = getMLApiUrl()

  const response = await axios.post<PipelineAggregateResponse>(
    `${mlApiUrl}/pipeline/aggregate`
  )
  return response.data
}

/** Trigger feature extraction via the ML FastAPI service. */
export async function requestFeatureExtraction(): Promise<PipelineExtractResponse> {
  const mlApiUrl = getMLApiUrl()

  const response = await axios.post<PipelineExtractResponse>(
    `${mlApiUrl}/pipeline/extract-features`
  )
  return response.data
}

/** Trigger feature export via the ML FastAPI service. */
export async function requestFeatureExport(): Promise<PipelineExportResponse> {
  const mlApiUrl = getMLApiUrl()

  const response = await axios.post<PipelineExportResponse>(
    `${mlApiUrl}/pipeline/export-features`
  )
  return response.data
}

/** Send a file buffer to Python ML FastAPI service for high-fidelity conversion. */
export async function requestDocumentConversion(
  fileBuffer: Buffer,
  filename: string
): Promise<PythonConversionResponse> {
  const mlApiUrl = getMLApiUrl()

  const formData = new (require('form-data'))()
  formData.append('file', fileBuffer, filename)

  const response = await axios.post<PythonConversionResponse>(
    `${mlApiUrl}/convert/document`,
    formData,
    {
      headers: formData.getHeaders(),
    }
  )

  return pythonConversionResponseSchema.parse(response.data)
}

export interface FineTuneBridgeResponse {
  status: string
  message: string
  user_id: string
}

/** Trigger per-user supervised fine-tuning on the ML FastAPI service. */
export async function triggerFineTune(userId: string): Promise<FineTuneBridgeResponse> {
  const mlApiUrl = getMLApiUrl()
  const response = await axios.post<FineTuneBridgeResponse>(`${mlApiUrl}/fine-tune`, {
    user_id: userId,
  })
  return response.data
}

