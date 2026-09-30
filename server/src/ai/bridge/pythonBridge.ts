import axios from 'axios'
import FormData from 'form-data'
import { createReadStream } from 'fs'
import {
  pythonComplianceAuditResponseSchema,
  type PythonComplianceAuditResponse,
} from '../../../schemas/auditSchemas'
import {
  pythonHealthSchema,
  type PythonHealthResponse,
} from '../../../schemas/healthSchemas'
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
  isolationMode: string
}

/** Isolation modes control how the user model contributes to a prediction. */
export type IsolationMode = 'baseline' | 'isolated' | 'hybrid'

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
  /** Candidate corrections the spell checker considers plausible. */
  suggestions?: string[]
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

/**
 * Rethrow an ML service failure with the resolved service URL and a fix hint,
 * so the frontend banner can show exactly which address failed.
 */
function mlError(action: string, mlApiUrl: string, error: unknown, hint: string): never {
  const detail = error instanceof Error ? error.message : String(error)
  throw new Error(
    `ML service at ${mlApiUrl} failed (${action}): ${detail}. ${hint}`
  )
}

/**
 * Probe the FastAPI service liveness. Never throws: a health check must report
 * a down dependency rather than propagate, so the caller decides the verdict.
 */
export async function probeMlHealth(timeoutMs = 2000): Promise<{
  reachable: boolean
  payload: PythonHealthResponse | null
  error: string | null
  latencyMs: number
}> {
  const mlApiUrl = getMLApiUrl()
  const startedAt = Date.now()

  try {
    const response = await axios.get<PythonHealthResponse>(`${mlApiUrl}/health`, {
      timeout: timeoutMs,
    })

    return {
      reachable: true,
      payload: pythonHealthSchema.parse(response.data),
      error: null,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      reachable: false,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    }
  }
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
    isolationMode?: IsolationMode
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
      isolation_mode: options?.isolationMode,
    }
  )
  const data = pythonPredictionResponseSchema.parse(response.data)

  return {
    predictedFormat: data.predicted_format,
    confidence: data.confidence,
    featureValues: data.feature_values ?? {},
    isolationMode: data.isolation_mode ?? 'hybrid',
  }
}

/** Send a grammar check request to the FastAPI service. */
export async function requestGrammarCheck(
  text: string
): Promise<GrammarCheckResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post<PythonGrammarCheckResponse>(
      `${mlApiUrl}/grammar/check`,
      { text }
    )

    return pythonGrammarCheckResponseSchema.parse(response.data)
  } catch (error) {
    mlError(
      'grammar check',
      mlApiUrl,
      error,
      'Start the FastAPI service (ml/src/main.py) locally or fix ML_API_URL / PYTHON_API_URL.'
    )
  }
}

/** Send a spelling check request to the FastAPI service. */
export async function requestSpellingCheck(
  text: string
): Promise<SpellingCheckResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post<PythonSpellingCheckResponse>(
      `${mlApiUrl}/spelling/check`,
      { text }
    )

    return pythonSpellingCheckResponseSchema.parse(response.data)
  } catch (error) {
    mlError(
      'spelling check',
      mlApiUrl,
      error,
      'Start the FastAPI service (ml/src/main.py) locally or fix ML_API_URL / PYTHON_API_URL.'
    )
  }
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

  const formData = new FormData()
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

/**
 * Send a file that already lives on disk to the Python conversion service.
 * Used for large documents: form-data streams the read stream straight out of
 * the filesystem, so the bytes are never copied into a second in-memory buffer.
 */
export async function requestDocumentConversionFromPath(
  filePath: string,
  filename: string
): Promise<PythonConversionResponse> {
  const mlApiUrl = getMLApiUrl()

  const formData = new FormData()
  formData.append('file', createReadStream(filePath), filename)

  const response = await axios.post<PythonConversionResponse>(
    `${mlApiUrl}/convert/document`,
    formData,
    {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  )

  return pythonConversionResponseSchema.parse(response.data)
}

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

/** Page layout and header/footer state the layout rules audit against. */
export interface CompliancePageSetup {
  margins: PageMargins
  showHeader: boolean
  showFooter: boolean
  headerNumberFormat: 'none' | 'number' | 'roman'
  footerNumberFormat: 'none' | 'number' | 'roman'
}

/** The template rules a document is audited against. */
export interface ComplianceRequirements {
  mandatoryHeadings: string[]
  referenceStyle: 'apa' | 'ieee'
  requiredMarginInches: number
  referencesRequired: boolean
}

/**
 * Send a document to the Python compliance auditor.
 *
 * The response is validated with Zod because Tier 2 fields are nullable when
 * the compliance models are not installed, and an unvalidated payload would
 * silently type ml_score as a number.
 */
export async function requestComplianceAudit(
  content: string,
  pageSetup: CompliancePageSetup,
  requirements: ComplianceRequirements
): Promise<PythonComplianceAuditResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post<PythonComplianceAuditResponse>(
      `${mlApiUrl}/audit/compliance`,
      {
        content,
        page_setup: {
          margins: pageSetup.margins,
          show_header: pageSetup.showHeader,
          show_footer: pageSetup.showFooter,
          header_number_format: pageSetup.headerNumberFormat,
          footer_number_format: pageSetup.footerNumberFormat,
        },
        requirements: {
          mandatory_headings: requirements.mandatoryHeadings,
          reference_style: requirements.referenceStyle,
          required_margin_inches: requirements.requiredMarginInches,
          references_required: requirements.referencesRequired,
        },
      },
      { timeout: 60000 }
    )

    return pythonComplianceAuditResponseSchema.parse(response.data)
  } catch (error) {
    mlError(
      'compliance audit',
      mlApiUrl,
      error,
      'Start the FastAPI service (ml/src/main.py) locally or fix ML_API_URL / PYTHON_API_URL.'
    )
  }
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

