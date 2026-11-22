import type { DocumentGenre } from '../../types/index'
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
  type TextBlock,
  type PythonPredictionResponse,
  type PythonSpellingCheckResponse,
} from '../../../schemas/predictionSchemas'
import {
  pythonCouncilScanResponseSchema,
  pythonOriginalityResponseSchema,
  type PythonCouncilScanResponse,
  type PythonOriginalityResponse,
} from '../../../schemas/plagiarismSchemas'

export interface PredictionResponse {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
  isolationMode: string
  /** True only when the user's model for the requested genre contributed. */
  genrePartitionHit: boolean
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

/** Longest wait for a formatting prediction (a cold service loads its models in ~15 s). */
export const PREDICT_TIMEOUT_MS = 10_000

/** Send a formatting prediction request to the FastAPI service, scoped to one genre partition. */
export async function requestFormatPrediction(
  text: string,
  options: {
    genre: DocumentGenre
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
      user_id: options.userId,
      font_size: options.fontSize,
      is_bold: options.isBold,
      is_italic: options.isItalic,
      x_position: options.xPosition,
      isolation_mode: options.isolationMode,
      genre: options.genre,
    },
    // A suggestion that comes late is useless, and a stalled service must not stall the editor.
    { timeout: PREDICT_TIMEOUT_MS }
  )
  const data = pythonPredictionResponseSchema.parse(response.data)

  return {
    predictedFormat: data.predicted_format,
    confidence: data.confidence,
    featureValues: data.feature_values ?? {},
    isolationMode: data.isolation_mode ?? 'hybrid',
    genrePartitionHit: data.genre_partition_hit,
  }
}

/** Text sent to a checker: per-block layout data, or plain text from older callers. */
export interface CheckInput {
  text?: string
  blocks?: TextBlock[]
}

/** Send a grammar check request to the FastAPI service. */
export async function requestGrammarCheck(
  input: CheckInput
): Promise<GrammarCheckResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post<PythonGrammarCheckResponse>(
      `${mlApiUrl}/grammar/check`,
      input
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
  input: CheckInput
): Promise<SpellingCheckResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post<PythonSpellingCheckResponse>(
      `${mlApiUrl}/spelling/check`,
      input
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

export interface ConversionOptions {
  /**
   * Ask for the pictures beside the JSON instead of inline (see resolveConvertedImages). A large
   * manuscript's inline pictures make the response longer than Node can hold as one string.
   */
  separateImages?: boolean
  /** Ask for a long manuscript back split into document tabs (tab markers in its HTML and JSON). */
  splitTabs?: boolean
}

/** The converter's query string for these options. */
function conversionParams(options: ConversionOptions): Record<string, string> | undefined {
  const params: Record<string, string> = {}
  if (options.separateImages) params.images = 'separate'
  if (options.splitTabs) params.tabs = 'true'
  return Object.keys(params).length > 0 ? params : undefined
}

/** A file the converter refused as given (password-protected, damaged): a 400 with its reason. */
export class DocumentRejectedError extends Error {
  readonly status = 400
  readonly code = 'document_unreadable'
}

/** Turn the converter's 4xx answer into DocumentRejectedError; other failures pass unchanged. */
function rejectedConversion(error: unknown): never {
  if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) {
    const detail = (error.response.data as { detail?: unknown } | undefined)?.detail
    throw new DocumentRejectedError(typeof detail === 'string' && detail ? detail : 'This file could not be imported.')
  }
  throw error
}

/** Send a file buffer to Python ML FastAPI service for high-fidelity conversion. */
export async function requestDocumentConversion(
  fileBuffer: Buffer,
  filename: string,
  options: ConversionOptions = {}
): Promise<PythonConversionResponse> {
  const mlApiUrl = getMLApiUrl()

  const formData = new FormData()
  formData.append('file', fileBuffer, filename)

  const response = await axios
    .post<PythonConversionResponse>(`${mlApiUrl}/convert/document`, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      params: conversionParams(options),
      timeout: conversionTimeoutMs(fileBuffer.length),
    })
    .catch(rejectedConversion)

  return pythonConversionResponseSchema.parse(response.data)
}

/**
 * How long a conversion may take: three minutes, plus three seconds per megabyte. A 190 MB
 * manuscript takes about three minutes of converting and picture shrinking on its own; a fixed
 * limit timed it out and sent the import to the slow fallback converter.
 */
export function conversionTimeoutMs(bytes: number): number {
  return 180_000 + Math.ceil(bytes / 1_000_000) * 3_000
}

/** True for a conversion that ran out of time (the converter is busy, not broken). */
export function isConversionTimeout(error: unknown): boolean {
  return axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(error.message))
}

/**
 * Send a file that already lives on disk to the Python conversion service.
 * Used for large documents: form-data streams the read stream straight out of
 * the filesystem, so the bytes are never copied into a second in-memory buffer.
 */
export async function requestDocumentConversionFromPath(
  filePath: string,
  filename: string,
  options: ConversionOptions = {}
): Promise<PythonConversionResponse> {
  const mlApiUrl = getMLApiUrl()

  const formData = new FormData()
  formData.append('file', createReadStream(filePath), filename)

  const response = await axios
    .post<PythonConversionResponse>(`${mlApiUrl}/convert/document`, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      params: conversionParams(options),
    })
    .catch(rejectedConversion)

  return pythonConversionResponseSchema.parse(response.data)
}

/** One picture of a conversion requested with separateImages. */
export async function fetchConvertedImage(imageSet: string, key: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(
    `${getMLApiUrl()}/convert/images/${encodeURIComponent(imageSet)}/${encodeURIComponent(key)}`,
    { responseType: 'arraybuffer', timeout: 60000 }
  )
  return Buffer.from(response.data)
}

/** Let the converter drop a conversion's pictures once they are stored. Never throws. */
export async function releaseConvertedImages(imageSet: string): Promise<void> {
  await axios
    .delete(`${getMLApiUrl()}/convert/images/${encodeURIComponent(imageSet)}`, { timeout: 15000 })
    .catch(() => undefined)
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
  headerNumberFormat: 'none' | 'number' | 'roman' | 'manuscript'
  footerNumberFormat: 'none' | 'number' | 'roman' | 'manuscript'
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




export interface ParseDocumentResponse {
  html: string
  title?: string
  word_count?: number
  detected_template?: string
  reading_order_applied?: boolean
}

/**
 * Stream a document to the ML service for parsing (multi-column + tables + equations).
 */
export async function parseDocument(file: { buffer: Buffer; filename: string; mimetype: string }): Promise<ParseDocumentResponse> {
  const mlApiUrl = getMLApiUrl()
  const FormData = (await import('form-data')).default
  const form = new FormData()
  form.append('file', file.buffer, { filename: file.filename, contentType: file.mimetype })
  try {
    const response = await axios.post<ParseDocumentResponse>(`${mlApiUrl}/parse/document`, form, {
      headers: form.getHeaders(),
      timeout: 120000,
      maxContentLength: 50 * 1024 * 1024,
    })
    return response.data
  } catch (error) {
    mlError(
      'document parse',
      mlApiUrl,
      error,
      'Ensure marker/opendataloader deps are installed in the ML environment and the /parse/document endpoint is running.'
    )
  }
}

/** One peer document supplied to the council scan. */
export interface CouncilScanPeer {
  documentId: string
  userId: string
  text: string
}

/** One AI backend the council may use (comma-separated keys rotate within it). */
export interface CouncilAIProfile {
  provider: string
  apiKeys: string[]
  model: string
}

/**
 * AI configuration forwarded to the council: every configured profile plus which
 * profile (0-based index) each judge role uses first. An empty profile list
 * makes the ML service fall back to its own environment.
 */
export interface CouncilAIConfig {
  profiles: CouncilAIProfile[]
  assignments: Record<string, number>
}

/**
 * Run the triage + 5-judge council scan for one document against its peers.
 * This is the only bridge function that talks to the /council/scan endpoint.
 */
export async function requestCouncilScan(payload: {
  documentId: string
  userId: string
  folderId: string
  text: string
  peers: CouncilScanPeer[]
  /** Raw behavior events used by the timeline forensics engine. */
  timeline: unknown[]
  ai: CouncilAIConfig
  /** Review only the N strongest flagged passages with the AI judges. */
  maxMatches?: number
}): Promise<PythonCouncilScanResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post(
      `${mlApiUrl}/council/scan`,
      {
        document_id: payload.documentId,
        user_id: payload.userId,
        folder_id: payload.folderId,
        text: payload.text,
        peers: payload.peers.map((peer) => ({
          document_id: peer.documentId,
          user_id: peer.userId,
          text: peer.text,
        })),
        timeline: payload.timeline,
        max_matches: payload.maxMatches ?? 0,
        ai:
          payload.ai.profiles.length > 0
            ? {
                profiles: payload.ai.profiles.map((profile) => ({
                  provider: profile.provider,
                  api_key: profile.apiKeys.join(','),
                  model: profile.model,
                })),
                assignments: payload.ai.assignments,
              }
            : null,
      },
      { timeout: 180000 }
    )

    return pythonCouncilScanResponseSchema.parse(response.data)
  } catch (error) {
    mlError(
      'council scan',
      mlApiUrl,
      error,
      'Start the FastAPI service (ml/src/main.py) locally or fix ML_API_URL / PYTHON_API_URL.'
    )
  }
}


/** One of the student's other documents supplied to the originality check. */
export interface OriginalityPeer {
  documentId: string
  title: string
  text: string
}

/**
 * Compare a document against the student's own other documents (lexical only,
 * no AI judges). This is the only bridge function that talks to /originality/check.
 */
export async function requestOriginalityCheck(payload: {
  text: string
  peers: OriginalityPeer[]
}): Promise<PythonOriginalityResponse> {
  const mlApiUrl = getMLApiUrl()

  try {
    const response = await axios.post(
      `${mlApiUrl}/originality/check`,
      {
        text: payload.text,
        peers: payload.peers.map((peer) => ({
          document_id: peer.documentId,
          title: peer.title,
          text: peer.text,
        })),
      },
      { timeout: 60000 }
    )

    return pythonOriginalityResponseSchema.parse(response.data)
  } catch (error) {
    mlError(
      'originality check',
      mlApiUrl,
      error,
      'Start the FastAPI service (ml/src/main.py) locally or fix ML_API_URL / PYTHON_API_URL.'
    )
  }
}
