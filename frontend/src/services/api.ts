// Do not remove
// For some reason it give an error without the the line below
// ???
/// <reference types="vite/client" />

import { supabase } from '../lib/supabase'
import { generateCitationKey, type CitationData, type CitationReference } from '@/lib/citationFormats'
import type { ComplianceReport } from '../components/ThesisChecklist'
import type { CouncilMatchVerdict } from '../components/editor/plagiarismTypes'
import {
  AdminApplicant,
  AdminDocumentRecord,
  AdminUserRecord,
  RoleName,
  SystemReport,
  VerifyApplicantBody,
  ReportTimeseries,
} from '../types/admin'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface User {
  id: string
  email: string
  displayName?: string | null
  role?: 'student' | 'professor' | 'admin'
  verificationStatus?: 'pending' | 'approved' | 'rejected'
  requestedRole?: 'student' | 'professor' | 'admin' | null
}

export type PageNumberFormat = 'none' | 'number' | 'roman'

export type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

export type PageOrientation = 'portrait' | 'landscape'

export interface MarginValues {
  top: number
  bottom: number
  left: number
  right: number
}

export interface DocumentRecord {
  id: string
  user_id: string
  title: string
  content: string
  /** Short, sanitized content prefix for grid previews (migration 026). */
  preview_snippet?: string
  header_content: string
  footer_content: string
  show_header: boolean
  show_footer: boolean
  header_number_format: PageNumberFormat
  footer_number_format: PageNumberFormat
  page_size: PageSizeKey
  margins: MarginValues
  orientation: PageOrientation
  formatting_history: unknown[]
  is_isolated: boolean
  formatting_preset: string | null
  /** Citation style and references saved with the document (migration 029). */
  citation_data?: CitationData | null
  is_deleted: boolean
  deleted_at: string | null
  share_permission?: SharePermission
  share_token?: string | null
  share_expires_at?: string | null
  shared_by?: string
  created_at: string
  updated_at: string
}

export interface DocumentVersion {
  version_id: string
  document_id: string
  user_id: string
  content: string
  title: string
  word_count: number | null
  version_number: number | null
  page_size: PageSizeKey | null
  margins: MarginValues | null
  orientation: PageOrientation | null
  editor_prefs: Record<string, unknown> | null
  reason: string
  created_at: string
}

export interface FolderRecord {
  folder_id: string
  user_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
  folder_type?: FolderType
  class_code?: string | null
  academic_term?: string | null
  /** Private code students type to join the class; only sent to the class owner. */
  join_code?: string | null
  submission_count?: number
  enrolled_count?: number
}

/** A folder is either the owner's private workspace or a shared class folder. */
export type FolderType = 'personal' | 'class'

/** Course details accepted when creating a class folder. */
export interface CreateFolderOptions {
  folderType: FolderType
  classCode?: string
  academicTerm?: string
}

/** One enrolled student in a class folder roster. */
export interface ClassEnrollmentRecord {
  folder_id: string
  student_id: string
  enrolled_at: string
  email: string | null
  display_name: string | null
}

export interface BehaviorEventPayload {
  text?: string
  format?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
  payload?: BehaviorEventPayload
  /** Characters affected by composition events (type/paste/backspace). */
  char_count?: number
  /** Document position where a composition event happened. */
  position?: number
  /** Document size at event time, for position normalisation. */
  doc_size?: number
}

export interface BehaviorSummaryLatestEvent extends BehaviorEvent {
  userId?: string
}

export interface BehaviorSummaryResponse {
  documentId: string
  totalEvents: number
  formatActions: Record<string, number>
  chatPreviewAccepted: Record<string, number>
  chatPreviewRejected: Record<string, number>
  latestEvents: BehaviorSummaryLatestEvent[]
}

export interface PredictionResponse {
  predicted_format: string
  confidence: number
  feature_values: Record<string, number>
  lstm_adjusted?: boolean
  isolation_mode?: 'baseline' | 'isolated' | 'hybrid'
}

interface LoginResponse {
  user: User
  session: { access_token: string; refresh_token: string }
  message: string
}

interface GoogleSyncResponse {
  user: User
  role: 'student' | 'professor' | 'admin'
  verificationStatus: 'pending' | 'approved' | 'rejected'
  requestedRole?: 'student' | 'professor' | 'admin' | null
  message: string
}

/** Signed-in user's own storage usage vs their account quota. */
export interface StorageSummary {
  usedBytes: number
  quotaBytes: number
  role: 'student' | 'professor' | 'admin'
}

/** The signed-in user's live role and verification status. */
export interface RoleStatusResponse {
  role: 'student' | 'professor' | 'admin'
  verificationStatus: 'pending' | 'approved' | 'rejected'
  requestedRole?: 'student' | 'professor' | 'admin' | null
}

/** The signed-in user's latest application and the administrator's decision on it. */
export interface ApplicationStatusResponse {
  requestedRole: string | null
  verificationStatus: 'pending' | 'approved' | 'rejected'
  decisionNote: string | null
  decidedAt: string | null
}

interface RegisterResponse {
  user: User
  message: string
}

interface UpdateDocumentRequest {
  title?: string
  content?: string
  header_content?: string
  footer_content?: string
  show_header?: boolean
  show_footer?: boolean
  header_number_format?: PageNumberFormat
  footer_number_format?: PageNumberFormat
  page_size?: PageSizeKey
  margins?: MarginValues
  orientation?: PageOrientation
  formatting_history?: string[]
  is_isolated?: boolean
  formatting_preset?: string | null
  citation_data?: CitationData
}

// ── Three-tier formatting control system types ──────────────────────────────

export interface TriggerCondition {
  maxWords?: number
  minWords?: number
  maxChars?: number
  standaloneLine?: boolean
  startsWith?: string
  contains?: string
}

export interface FormatRule {
  condition: TriggerCondition
  format: string
  priority: number
}

export interface FormatPreset {
  id: string
  key: string
  name: string
  description: string
  rules: FormatRule[]
  is_system: boolean
}

/**
 * A standard blueprint forked by the current user. Forking never edits the
 * standard preset in place, so the second customisation of one blueprint
 * produces a new "... (Custom v3)" rather than overwriting v2.
 */
export interface UserPreset {
  preset_id: string
  user_id: string
  key: string
  base_key: string
  name: string
  description: string
  rules: FormatRule[]
  version: number
  created_at: string
  updated_at: string
}

/** Payload for forking a standard blueprint into a personal preset. */
export interface CreateUserPresetRequest {
  baseKey: string
  name?: string
  description?: string
  rules?: FormatRule[]
}

export interface FormatBinding {
  id: string
  user_id: string
  trigger_condition: TriggerCondition
  format_to_apply: string
  priority: number
  created_at: string
}

export interface TierCheckResponse {
  tier: 'binding' | 'preset' | 'ml' | 'learned' | 'none'
  format?: string
  confidence?: number
  reason?: string
  feature_values?: Record<string, number>
  /** Present on learned-tier responses — reproduces the user's own format. */
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
  snippet?: string
}

/** Result of inferring a document's academic archetype from its opening text. */
export interface InferredStructureResponse {
  type: 'academic_thesis' | 'ieee_manuscript' | 'apa_manuscript' | 'unknown'
  typeLabel: string
  presetKey: string | null
  matchedMarkers: string[]
}

export type ProfileScope = 'formatting' | 'grammar' | 'both'

/** A portable .idocprofile format binding (no ownership/timestamps). */
export interface PortableFormatBinding {
  trigger_condition: TriggerCondition
  format_to_apply: string
  priority: number
}

/** Portable personalization bundle exchanged as an .idocprofile file. */
export interface IdocProfile {
  version: string
  creator_email?: string
  exported_at?: string
  scope: ProfileScope
  formatting?: { custom_bindings: PortableFormatBinding[] }
  grammar_spelling?: { custom_dictionary: string[]; ignored_patterns: string[] }
}

export interface ProfileImportResult {
  message: string
  added_bindings: number
  skipped_bindings: number
  added_words: number
  added_patterns: number
}

export interface DocumentShare {
  share_id: string
  document_id: string
  owner_id: string
  shared_with: string | null
  pending_email: string | null
  permission: SharePermission
  shared_at: string
}

export interface DocumentShareLink {
  share_token: string | null
  share_permission: SharePermission
  share_expires_at: string | null
}

export type SharePermission = 'view' | 'comment' | 'edit'

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

export interface SpellCheckResponse {
  issues: SpellingIssue[]
  count: number
  message: string
}

export interface AIChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface RejectedFormattingPreview {
  format: string
  reason?: string
  rejectedAt?: string
}

export interface AIChatPreview {
  format: string
  label: string
  confidence: number
  reason?: string
  /** Every requested format (e.g. ["bold", "italic"] for "make everything bold italic"). */
  formats?: string[]
  /** Document scope: current selection or the whole document. */
  scope?: 'selection' | 'all'
  /** Explicit font size in points, e.g. "font size 20". */
  fontSize?: number | null
  /** Chapter/section reference like "chapter 1" the change should target without highlighting. */
  target?: string | null
  /** How the target is meant: literal words, a whole section, or the document title. */
  targetMode?: 'literal' | 'section' | 'title' | null
  /** Block category a bulk request targets: headings, paragraphs, chapter headings, or all. */
  targetCategory?: 'headings' | 'paragraphs' | 'chapters' | 'all' | null
  /** True when the change clears existing formatting (revert to normal). */
  normalize?: boolean
}

/** Snapshot of the last shown preview, sent back so follow-ups resolve to it. */
export interface AIChatPreviewMeta {
  format?: string
  formats?: string[]
  scope?: 'selection' | 'all'
  fontSize?: number | null
  target?: string | null
  targetMode?: 'literal' | 'section' | 'title' | null
  targetCategory?: 'headings' | 'paragraphs' | 'chapters' | 'all' | null
  normalize?: boolean
}

/** Accept/reject counts for one group of suggestions; the rate is a whole percent or null with no data. */
export interface LearningBucket {
  total: number
  accepted: number
  acceptRate: number | null
}

/** The user's suggestion accept rates (server: summarizeLearning). */
export interface LearningSummary {
  overall: LearningBucket
  byType: Record<string, LearningBucket>
  weekly: Array<LearningBucket & { weekStart: string }>
}

export interface AIChatResponse {
  reply: string
  provider: string
  model: string
  mode?: 'chat' | 'preview'
  preview?: AIChatPreview | null
  /** Sections of the document an AI answer was based on; present only for AI answers. */
  sources?: Array<{ title: string }>
}

export type MCPToolName =
  | 'getDocumentContent'
  | 'applyFormatting'
  | 'applyBulkFormatting'
  | 'getUserProfile'
  | 'predictNextFormat'
  | 'getBehaviorSummary'
  | 'explainSuggestion'

export interface MCPToolCall { 
  tool: MCPToolName
  args: Record<string, unknown>
}

export interface MCPToolListResponse { 
  tools: { name: MCPToolName }[]
}

export interface DriveFile {
  id: string
  name: string
  mimeType?: string
  modifiedTime: string
  iconLink: string
  /** Size in bytes as a string, absent for native Google Workspace files. */
  size?: string
}

/** Lifecycle of a large-file Drive import. done and failed are terminal. */
export type ImportJobState =
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'failed'

export interface ImportJob {
  id: string
  fileId: string
  fileName: string
  /** 0-100. The server clamps the download phase at 99. */
  progress: number
  state: ImportJobState
  title: string
  /** Converted document HTML; empty until the job reaches done. */
  html: string
  error: string
  createdAt: number
  updatedAt: number
}

export interface DocumentComment {
  comment_id: string
  document_id: string
  user_id: string
  highlighted_text: string | null
  comment: string
  created_at: string
}

export interface DocumentReview {
  review_id: string
  document_id: string
  reviewer_id: string
  student_id: string
  grade: number | null
  status: 'pending' | 'under_review' | 'graded' | 'returned'
  notes: string | null
  reviewed_at: string
}

/** Whether a scan compares inside one class or across all of a professor's classes. */
export type PlagiarismScope = 'local' | 'global'

/** A student taking part in the class similarity comparison. */
export interface ClassSimilarityStudent {
  studentId: string
  studentName: string
  /** Document ids this student submitted to the folder. */
  documentIds: string[]
  /** Set for students from the professor's other classes (global view only). */
  className?: string
}

/** Highest passage similarity found between two students' submissions. */
export interface ClassSimilarityPair {
  studentAId: string
  studentBId: string
  /** Percentage (0–100) of the strongest flagged passage between the pair. */
  similarity: number
}

/** Everything the professor similarity matrix needs for one class folder. */
export interface ClassSimilarityMatrix {
  students: ClassSimilarityStudent[]
  pairs: ClassSimilarityPair[]
}

/** One passage that overlaps with another of the student's own documents. */
export interface OriginalityPassage {
  paragraph_index: number
  text: string
  similarity: number
  match_type: string
  peer_document_id: string
  peer_title: string
  peer_excerpt: string
}

/** Result of the student originality self-check. */
export interface OriginalityResult {
  overlap_percent: number
  passages: OriginalityPassage[]
}

/** One judge's answer on a passage, so the student sees which model said what. */
export interface OriginalityJudgeAnswer {
  judge: string
  provider: string
  model: string
  verdict: string
}

/** The AI council's review of one overlapping passage. */
export interface OriginalityPassageReview {
  paragraph_index: number
  text: string
  peer_document_id: string | null
  peer_title: string | null
  similarity: number
  verdict: 'original' | 'paraphrased' | 'reused' | 'inconclusive'
  confidence: number
  reasoning: string
  judges: OriginalityJudgeAnswer[]
}

/** Result of asking the AI judges to review the flagged passages. */
export interface OriginalityReview {
  reviews: OriginalityPassageReview[]
  activeJudges: number
}

/** A persisted plagiarism scan row. */
export interface PlagiarismScanRecord {
  scan_id: string
  document_id: string
  user_id: string
  folder_id: string | null
  overall_originality_score: number
  peer_similarity_score: number
  external_similarity_score: number
  active_judges_count: number
  quorum_reached: boolean
  council_transcript: unknown
  scan_status: string
  scope?: PlagiarismScope
  created_at: string
  updated_at: string
}

/** A persisted flagged-passage match row. */
export interface PlagiarismMatchRecord {
  match_id: string
  scan_id: string
  paragraph_index: number
  char_start: number
  char_end: number
  matched_document_id: string | null
  matched_student_id: string | null
  matched_folder_id?: string | null
  similarity_score: number
  match_type: string
  match_severity: string
  source_excerpt: string | null
  target_excerpt: string | null
  timeline_verdict: string | null
  flagged_text: string
  council_verdict: CouncilMatchVerdict | null
  created_at: string
}

/** One scan plus its matches, as returned to the inspection modal. */
export interface PlagiarismScanDetail {
  scan: PlagiarismScanRecord
  matches: PlagiarismMatchRecord[]
  documentTitle: string
}

export interface NotificationRecord {
  notification_id: string
  user_id: string
  type: string
  title: string
  message: string
  read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

/** Small sleep helper used between fetch retries. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Remove all persisted auth tokens and user data (used on final 401 only). */
function clearAuthSession(): void {
  localStorage.removeItem('authToken')
  localStorage.removeItem('authRefreshToken')
  localStorage.removeItem('authUser')
}

/** Singleton refresh promise so concurrent 401s share one Supabase refresh. */
let sessionRefreshPromise: Promise<boolean> | null = null

/**
 * Attempt to refresh the Supabase session using the stored refresh token.
 * Persists the rotated access (and refresh) token if the refresh succeeds.
 */
async function recoverAuthSession(): Promise<boolean> {
  if (sessionRefreshPromise) return sessionRefreshPromise

  sessionRefreshPromise = (async () => {
    const accessToken = localStorage.getItem('authToken')
    const refreshToken = localStorage.getItem('authRefreshToken')
    if (!accessToken || !refreshToken) return false

    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      const session = data.session
      if (error || !session) return false
      localStorage.setItem('authToken', session.access_token)
      if (session.refresh_token) {
        localStorage.setItem('authRefreshToken', session.refresh_token)
      }
      return true
    } catch {
      return false
    }
  })().finally(() => {
    sessionRefreshPromise = null
  })

  return sessionRefreshPromise
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isSafeMethod = !options?.method || options.method === 'GET' || options.method === 'HEAD'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = getAuthToken()
    const response: Response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      ...options,
      headers: {
        ...options?.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }).catch(async (): Promise<Response> => {
      // Network-level failure (e.g. server mid-restart). Retry for safe methods.
      if (isSafeMethod && attempt < 2) {
        await delay(attempt === 0 ? 300 : 1000)
        return fetch(`${API_BASE_URL}/${endpoint}`, {
          ...options,
          headers: {
            ...options?.headers,
            ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          },
        })
      }
      throw new Error('Network error: unable to reach the server.')
    })

    if (response.status === 204) {
      return null as T
    }

    if (response.ok) {
      return response.json() as Promise<T>
    }

    const rawBody: string = await response.text().catch(() => '')

    let errorMessage = `HTTP ${response.status}: Request failed`
    try {
      const parsed = JSON.parse(rawBody) as { error?: unknown }
      if (typeof parsed.error === 'string') errorMessage = parsed.error
    } catch {
      /* body is not JSON (e.g. proxy HTML error page) */
    }

    // TEMP DIAGNOSTIC: identify the source of repeated 500s on first login.
    if (response.status >= 500) {
      console.error('[api:diag]', endpoint, 'status=', response.status, 'body=', rawBody.slice(0, 300))
    }

    if (response.status === 401) {
      if (attempt === 0 && (await recoverAuthSession())) {
        continue // tokens rotated, retry with the new Authorization header
      }
      clearAuthSession()
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { status: 401, message: errorMessage } }))
      const err = new Error(errorMessage) as Error & { status?: number }
      err.status = 401
      throw err
    }

    if (response.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:forbidden', { detail: { status: 403, message: errorMessage } }))
    }

    // Transient server-side failure (e.g. Express/tsx warm-up or Supabase hiccup).
    if (response.status >= 500 && isSafeMethod && attempt < 2) {
      await delay(attempt === 0 ? 300 : 1000)
      continue
    }

    const err = new Error(errorMessage) as Error & { status?: number }
    err.status = response.status
    throw err
  }

  const err = new Error('Request failed after retries') as Error & { status?: number }
  err.status = 502
  throw err
}

export const api = {
  health: async (): Promise<{ status: string; message: string }> => {
    return fetchAPI<{ status: string; message: string }>('health')
  },

  auth: {
    login: async (email: string, password: string): Promise<LoginResponse> => {
      return fetchAPI<LoginResponse>('auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
    register: async (email: string, password: string): Promise<RegisterResponse> => {
      return fetchAPI<RegisterResponse>('auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
    /** The caller's application state and any admin decision note. */
    applicationStatus: async (): Promise<ApplicationStatusResponse> => {
      return fetchAPI<ApplicationStatusResponse>('auth/application-status')
    },
    /** Submit a faculty verification application; the role changes only once an administrator approves it. */
    applyProfessor: async (payload: {
      college: string
      department: string
      institutionalEmail: string
      facultyId: string
      reason: string
    }): Promise<{ message: string; status: string }> => {
      return fetchAPI<{ message: string; status: string }>('auth/apply-professor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    /** Submit a student status application (regular user → pending student). */
    applyStudent: async (payload: {
      studentId: string
      college: string
      degreeProgram: string
    }): Promise<{ message: string; status: string }> => {
      return fetchAPI<{ message: string; status: string }>('auth/apply-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    /** Called after Google OAuth redirect to sync profile with Express backend. */
    googleSync: async (accessToken: string): Promise<GoogleSyncResponse> => {
      return fetchAPI<GoogleSyncResponse>('auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
    },
    /** Update the signed-in user's display name. */
    updateProfile: async (displayName: string): Promise<{ user: User; message: string }> => {
      return fetchAPI<{ user: User; message: string }>('auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      })
    },
    /** Return the signed-in user's storage usage vs their account quota. */
    storage: async (): Promise<StorageSummary> => {
      return fetchAPI<StorageSummary>('auth/storage')
    },
    /**
     * Return the signed-in user's current role and verification status, read
     * fresh from the server so an administrator approval is picked up without
     * requiring a new sign-in.
     */
    me: async (): Promise<RoleStatusResponse> => {
      return fetchAPI<RoleStatusResponse>('auth/me')
    },
  },

  documents: {
    list: async (): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>('documents')
    },
    shared: async (): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>('documents/shared')
    },
    trash: async (): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>('documents/trash')
    },
    share: async (documentId: string, email: string, permission: SharePermission): Promise<DocumentShare> => {
      return fetchAPI<DocumentShare>(`documents/${documentId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, permission }),
      })
    },
    listShares: async (documentId: string): Promise<DocumentShare[]> => {
      return fetchAPI<DocumentShare[]>(`documents/${documentId}/shares`)
    },
    updateShare: async (documentId: string, shareId: string, permission: SharePermission): Promise<DocumentShare> => {
      return fetchAPI<DocumentShare>(`documents/${documentId}/shares/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      })
    },
    removeShare: async (documentId: string, shareId: string): Promise<null> => {
      return fetchAPI<null>(`documents/${documentId}/shares/${shareId}`, {
        method: 'DELETE',
      })
    },
    getShareLink: async (documentId: string): Promise<DocumentShareLink> => {
      return fetchAPI<DocumentShareLink>(`documents/${documentId}/share-link`)
    },
    createShareLink: async (documentId: string, permission: SharePermission, expiresAt: string | null = null): Promise<DocumentShareLink> => {
      return fetchAPI<DocumentShareLink>(`documents/${documentId}/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, expiresAt }),
      })
    },
    updateShareLink: async (documentId: string, permission: SharePermission, expiresAt: string | null = null): Promise<DocumentShareLink> => {
      return fetchAPI<DocumentShareLink>(`documents/${documentId}/share-link`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, expiresAt }),
      })
    },
    revokeShareLink: async (documentId: string): Promise<null> => {
      return fetchAPI<null>(`documents/${documentId}/share-link`, {
        method: 'DELETE',
      })
    },
    trashDoc: async (id: string): Promise<null> => {
      return fetchAPI<null>(`documents/${id}/trash`, {
        method: 'POST',
      })
    },
    restore: async (id: string): Promise<null> => {
      return fetchAPI<null>(`documents/${id}/restore`, {
        method: 'POST',
      })
    },
    deletePermanent: async (id: string): Promise<null> => {
      return fetchAPI<null>(`documents/${id}/permanent`, {
        method: 'DELETE',
      })
    },
    get: async (id: string, shareToken?: string): Promise<DocumentRecord> => {
      const suffix = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : ''
      return fetchAPI<DocumentRecord>(`documents/${id}${suffix}`)
    },
    create: async (
      title: string,
      options?: { content?: string; formatting_preset?: string; unique_title?: boolean }
    ): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>('documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ...options }),
      })
    },
    update: async (id: string, data: UpdateDocumentRequest, shareToken?: string): Promise<DocumentRecord> => {
      const suffix = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : ''
      return fetchAPI<DocumentRecord>(`documents/${id}${suffix}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    delete: async (id: string): Promise<null> => {
      return fetchAPI<null>(`documents/${id}`, {
        method: 'DELETE',
      })
    },
    /** Toggle the is_isolated flag on a document. */
    toggleIsolation: async (id: string, isIsolated: boolean): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_isolated: isIsolated }),
      })
    },
    /** List version snapshots for a document (owner only, newest first). */
    versions: async (id: string): Promise<DocumentVersion[]> => {
      return fetchAPI<DocumentVersion[]>(`documents/${id}/versions`)
    },
    /** Restore a specific version snapshot, returning the restored document. */
    restoreVersion: async (id: string, versionId: string): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}/versions/${versionId}/restore`, {
        method: 'POST',
      })
    },
    import: async (file: File): Promise<DocumentRecord> => {
      const formData = new FormData()
      formData.append('file', file)
      // Do NOT set Content-Type — browser sets the multipart boundary automatically
      return fetchAPI<DocumentRecord>('documents/import', {
        method: 'POST',
        body: formData,
      })
    },
    /** Upload an editor image to storage and return its public URL. */
    uploadImage: async (file: File): Promise<string> => {
      const formData = new FormData()
      formData.append('image', file)
      // Do NOT set Content-Type — browser sets the multipart boundary automatically
      const response = await fetchAPI<{ url: string }>('documents/images', {
        method: 'POST',
        body: formData,
      })
      return response.url
    },
  },

  behavior: {
    log: async (event: BehaviorEvent): Promise<{ status: string }> => {
      return fetchAPI<{ status: string }>('behavior/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })
    },
    summary: async (documentId: string): Promise<BehaviorSummaryResponse> => {
      return fetchAPI<BehaviorSummaryResponse>(`behavior/summary/${documentId}`)
    },
  },

  formatting: {
    /** List all available Tier 1 presets. */
    listPresets: async (): Promise<FormatPreset[]> => {
      const response = await fetchAPI<{ presets: FormatPreset[] }>('formatting/presets')
      return response.presets
    },
    /** Assign a preset profile to a document. */
    setDocumentPreset: async (documentId: string, preset: string): Promise<{ message: string }> => {
      return fetchAPI<{ message: string }>(`formatting/documents/${documentId}/preset`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      })
    },
    /** List the current user's forked blueprint versions. */
    listUserPresets: async (): Promise<UserPreset[]> => {
      const response = await fetchAPI<{ presets: UserPreset[] }>('formatting/user-presets')
      return response.presets
    },
    /** Fork a standard blueprint into a new personal version. */
    createUserPreset: async (request: CreateUserPresetRequest): Promise<UserPreset> => {
      return fetchAPI<UserPreset>('formatting/user-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    },
    /** Delete one of the current user's forked blueprint versions. */
    deleteUserPreset: async (presetId: string): Promise<void> => {
      await fetchAPI<null>(`formatting/user-presets/${presetId}`, { method: 'DELETE' })
    },
    /** List the current user's custom Tier 2 bindings. */
    listBindings: async (): Promise<FormatBinding[]> => {
      const response = await fetchAPI<{ bindings: FormatBinding[] }>('formatting/bindings')
      return response.bindings
    },
    /** Create a custom formatting binding. */
    createBinding: async (triggerCondition: TriggerCondition, formatToApply: string, priority: number): Promise<FormatBinding> => {
      return fetchAPI<FormatBinding>('formatting/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_condition: triggerCondition,
          format_to_apply: formatToApply,
          priority,
        }),
      })
    },
    /** Update a custom formatting binding. */
    updateBinding: async (id: string, triggerCondition: TriggerCondition, formatToApply: string, priority: number): Promise<FormatBinding> => {
      return fetchAPI<FormatBinding>(`formatting/bindings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_condition: triggerCondition,
          format_to_apply: formatToApply,
          priority,
        }),
      })
    },
    /** Delete a custom formatting binding. */
    deleteBinding: async (id: string): Promise<null> => {
      return fetchAPI<null>(`formatting/bindings/${id}`, {
        method: 'DELETE',
      })
    },
    /** Run the three-tier check: binding -> preset -> ML fallback. */
    tierCheck: async (text: string, documentId: string): Promise<TierCheckResponse> => {
      return fetchAPI<TierCheckResponse>('formatting/tier-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, documentId }),
      })
    },
    /** Infer the academic archetype of a document's opening text. */
    inferStructure: async (text: string): Promise<InferredStructureResponse> => {
      return fetchAPI<InferredStructureResponse>('formatting/infer-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    },
  },

  profile: {
    /** Download the current user's .idocprofile bundle for a scope. */
    export: async (scope: ProfileScope = 'both'): Promise<IdocProfile> => {
      return fetchAPI<IdocProfile>(`profile/export?scope=${scope}`)
    },
    /** Import and merge an .idocprofile bundle into the current user's profile. */
    import: async (profile: IdocProfile): Promise<ProfileImportResult> => {
      return fetchAPI<ProfileImportResult>('profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    },
  },

  predictions: {
    predict: async (
      text: string,
      userId?: string,
      isolationMode?: 'baseline' | 'isolated' | 'hybrid'
    ): Promise<PredictionResponse> => {
      return fetchAPI<PredictionResponse>('predictions/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, user_id: userId, isolationMode }),
      })
    },
    grammarCheck: async (text: string): Promise<GrammarCheckResponse> => {
      return fetchAPI<GrammarCheckResponse>('predictions/grammar-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    },
    spellCheck: async (text: string): Promise<SpellCheckResponse> => {
      return fetchAPI<SpellCheckResponse>('predictions/spelling-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    },
  },

  ai: {
    chat: async (
      message: string,
      documentId?: string,
      documentTitle?: string,
      documentContent?: string,
      history?: AIChatHistoryMessage[],
      rejectedFormattingPreviews?: RejectedFormattingPreview[],
      lastPreview?: AIChatPreviewMeta | null
    ): Promise<AIChatResponse> => {
      return fetchAPI<AIChatResponse>('ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          documentId,
          documentTitle,
          documentContent,
          history,
          rejectedFormattingPreviews,
          lastPreview,
        }),
      })
    },
    /** How often the user accepts suggestions: overall, by kind and week by week. */
    learningStats: async (): Promise<LearningSummary> => {
      return fetchAPI<LearningSummary>('ai/feedback/stats')
    },
    /** Log structured user feedback (acceptance or rejection) for an AI formatting prediction. */
    logFeedback: async (payload: {
      documentId?: string
      predictionType: 'format_prompt' | 'suggestion_panel' | 'chat_preview'
      predictedFormat: string
      confidence?: number
      accepted: boolean
    }): Promise<{ status: string; message: string }> => {
      return fetchAPI<{ status: string; message: string }>('ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },

  },

  mcp: {
    listTools: async (): Promise<MCPToolListResponse> => {
      return fetchAPI<MCPToolListResponse>('mcp/tools')
    },
    callTool: async <T>(
      tool: MCPToolName,
      args: Record<string, unknown>
    ): Promise<T> => {
      return fetchAPI<T>('mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args }),
      })
    },
  },

  folders: {
    list: async (): Promise<FolderRecord[]> => {
      return fetchAPI<FolderRecord[]>('folders')
    },
    create: async (name: string, options?: CreateFolderOptions): Promise<FolderRecord> => {
      return fetchAPI<FolderRecord>('folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          folderType: options?.folderType ?? 'personal',
          classCode: options?.classCode,
          academicTerm: options?.academicTerm,
        }),
      })
    },
    rename: async (id: string, name: string): Promise<FolderRecord> => {
      return fetchAPI<FolderRecord>(`folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    },
    delete: async (id: string): Promise<null> => {
      return fetchAPI<null>(`folders/${id}`, {
        method: 'DELETE',
      })
    },
    documents: async (id: string): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>(`folders/${id}/documents`)
    },
    addDocument: async (folderId: string, documentId: string): Promise<{ status: string }> => {
      return fetchAPI<{ status: string }>(`folders/${folderId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
    },
    /** Join a class with its private code; also creates the student's workspace folder. */
    join: async (code: string): Promise<{ classFolder: FolderRecord; alreadyEnrolled: boolean }> => {
      return fetchAPI<{ classFolder: FolderRecord; alreadyEnrolled: boolean }>('folders/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
    },
    /** Replace a class folder's join code (owner only). */
    regenerateJoinCode: async (folderId: string): Promise<FolderRecord> => {
      return fetchAPI<FolderRecord>(`folders/${folderId}/join-code`, { method: 'POST' })
    },
    roster: async (folderId: string): Promise<ClassEnrollmentRecord[]> => {
      return fetchAPI<ClassEnrollmentRecord[]>(`folders/${folderId}/enrollments`)
    },
    enroll: async (folderId: string, email: string): Promise<ClassEnrollmentRecord> => {
      return fetchAPI<ClassEnrollmentRecord>(`folders/${folderId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    },
    unenroll: async (folderId: string, studentId: string): Promise<null> => {
      return fetchAPI<null>(`folders/${folderId}/enrollments/${studentId}`, {
        method: 'DELETE',
      })
    },
  },

  drive: {
    getAuthUrl: async (): Promise<{ url: string }> => {
      return fetchAPI<{ url: string }>('drive/auth-url')
    },
    status: async (): Promise<{ connected: boolean }> => {
      return fetchAPI<{ connected: boolean }>('drive/status')
    },
    disconnect: async (): Promise<{ message: string }> => {
      return fetchAPI<{ message: string }>('drive/disconnect', {
        method: 'DELETE',
      })
    },
    /**
     * Link the Google provider token from a Google sign-in session to this
     * account. The server scopes the token to the authenticated user, so a token
     * can never be attached to another account.
     */
    linkProvider: async (
      providerToken: string,
      providerRefreshToken?: string
    ): Promise<{ connected: boolean; linked: boolean; message: string }> => {
      return fetchAPI<{ connected: boolean; linked: boolean; message: string }>(
        'drive/link-provider',
        {
          method: 'POST',
          body: JSON.stringify({ providerToken, providerRefreshToken }),
        }
      )
    },
    listFiles: async (): Promise<{ files: DriveFile[] }> => {
      return fetchAPI<{ files: DriveFile[] }>('drive/files')
    },
    /**
     * Import a Drive file. Small files resolve with the converted HTML; files
     * over the server's 15MB threshold resolve with a jobId instead, which the
     * caller must poll via getImport.
     */
    exportFile: async (
      fileId: string
    ): Promise<{ title: string; html: string } | { jobId: string; state: string; fileName: string; size: number }> => {
      return fetchAPI<{ title: string; html: string } | { jobId: string; state: string; fileName: string; size: number }>(
        `drive/files/${fileId}/export`
      )
    },
    /** Poll an async large-file import. Terminal states are done and failed. */
    getImport: async (jobId: string): Promise<ImportJob> => {
      return fetchAPI<ImportJob>(`drive/imports/${jobId}`)
    },
    /** List recent import jobs so a reloaded page can re-attach to one. */
    listImports: async (): Promise<{ jobs: ImportJob[] }> => {
      return fetchAPI<{ jobs: ImportJob[] }>('drive/imports')
    },
  },

  professor: {
    addComment: async (documentId: string, comment: string, highlightedText?: string): Promise<DocumentComment> => {
      return fetchAPI<DocumentComment>('professor/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, comment, highlightedText }),
      })
    },
    getComments: async (documentId: string): Promise<DocumentComment[]> => {
      return fetchAPI<DocumentComment[]>(`professor/documents/${documentId}/comments`)
    },
    submitGrade: async (documentId: string, studentId: string, grade: number, notes?: string): Promise<DocumentReview> => {
      return fetchAPI<DocumentReview>('professor/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, studentId, grade, notes }),
      })
    },
    getReview: async (documentId: string): Promise<DocumentReview | null> => {
      return fetchAPI<DocumentReview | null>(`professor/documents/${documentId}/review`)
    },
    /** Run the hybrid compliance audit for a document against a template. */
    auditCompliance: async (payload: {
      documentId: string
      mandatoryHeadings: string[]
      referenceStyle: 'apa' | 'ieee'
      requiredMarginInches: number
      referencesRequired: boolean
    }): Promise<ComplianceReport> => {
      return fetchAPI<ComplianceReport>('professor/audit/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    /** Class similarity matrix for one of the professor's class folders. */
    folderSimilarity: async (folderId: string, scope: PlagiarismScope = 'local'): Promise<ClassSimilarityMatrix> => {
      return fetchAPI<ClassSimilarityMatrix>(`professor/folders/${folderId}/similarity?scope=${scope}`)
    },
  },

  citations: {
    /** Find a reference from a DOI, a link or words from its title. */
    lookup: async (query: string): Promise<CitationReference> => {
      const found = await fetchAPI<Omit<CitationReference, 'id'>>('citations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      return { ...found, id: generateCitationKey(found) }
    },
  },

  plagiarism: {
    /** Run a council scan for one submission in a class folder. */
    runScan: async (folderId: string, documentId: string, scope: PlagiarismScope = 'local'): Promise<PlagiarismScanDetail> => {
      return fetchAPI<PlagiarismScanDetail>('plagiarism/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, folderId, scope }),
      })
    },
    /** Compare a document with the student's own other documents (nothing stored). */
    selfCheck: async (documentId: string): Promise<OriginalityResult> => {
      return fetchAPI<OriginalityResult>('plagiarism/self-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
    },
    /** Ask the AI judges to review this document's overlapping passages (nothing stored). */
    selfCheckReview: async (documentId: string): Promise<OriginalityReview> => {
      return fetchAPI<OriginalityReview>('plagiarism/self-check/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
    },
    /** Fetch one scan with its flagged matches. */
    getScan: async (scanId: string): Promise<PlagiarismScanDetail> => {
      return fetchAPI<PlagiarismScanDetail>(`plagiarism/scans/${scanId}`)
    },
    /** List the scans recorded for a class folder, newest first. */
    listFolderScans: async (folderId: string): Promise<PlagiarismScanRecord[]> => {
      return fetchAPI<PlagiarismScanRecord[]>(`plagiarism/folders/${folderId}/scans`)
    },
  },

  notifications: {
    list: async (): Promise<NotificationRecord[]> => {
      return fetchAPI<NotificationRecord[]>('notifications')
    },
    markAsRead: async (notificationId: string): Promise<NotificationRecord> => {
      return fetchAPI<NotificationRecord>(`notifications/${notificationId}/read`, {
        method: 'PUT',
      })
    },
  },

  admin: {
    getPendingApplicants: async (): Promise<AdminApplicant[]> => {
      return fetchAPI<AdminApplicant[]>('admin/applicants/pending')
    },
    verifyApplicant: async (userId: string, body: VerifyApplicantBody): Promise<{ message: string; newRole: RoleName | null }> => {
      return fetchAPI<{ message: string; newRole: RoleName | null }>(`admin/applicants/${userId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    getAllUsers: async (): Promise<AdminUserRecord[]> => {
      return fetchAPI<AdminUserRecord[]>('admin/users')
    },
    updateUserRole: async (userId: string, roleId: number): Promise<{ message: string; newRole: string }> => {
      return fetchAPI<{ message: string; newRole: string }>(`admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      })
    },
    getSystemReports: async (): Promise<SystemReport> => {
      return fetchAPI<SystemReport>('admin/reports')
    },
    /** Weekly sign-ups, documents and scans for the report charts. */
    getReportTimeseries: async (weeks = 12): Promise<ReportTimeseries> => {
      return fetchAPI<ReportTimeseries>(`admin/reports/timeseries?weeks=${weeks}`)
    },
    getAllDocuments: async (query?: string): Promise<AdminDocumentRecord[]> => {
      const qs = query && query.trim().length > 0 ? `?q=${encodeURIComponent(query.trim())}` : ''
      return fetchAPI<AdminDocumentRecord[]>(`admin/documents${qs}`)
    },
    deleteDocument: async (documentId: string): Promise<{ message: string }> => {
      return fetchAPI<{ message: string }>(`admin/documents/${documentId}`, {
        method: 'DELETE',
      })
    },
    /** Download the empirical research dataset as a CSV blob. */
    exportEmpiricalData: async (): Promise<Blob> => {
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/admin/export-empirical`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        throw new Error('Failed to export empirical data')
      }
      return response.blob()
    },
  },
}
