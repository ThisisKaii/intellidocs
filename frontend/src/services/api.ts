// Do not remove
// For some reason it give an error without the the line below
// ???
/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface User {
  id: string
  email: string
  displayName?: string | null
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
  created_at: string
  updated_at: string
}

export interface FolderRecord {
  folder_id: string
  user_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
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
}

interface LoginResponse {
  user: User
  session: { access_token: string }
  message: string
}

interface GoogleSyncResponse {
  user: User
  role: 'student' | 'professor' | 'admin'
  verificationStatus: 'pending' | 'approved' | 'rejected'
  message: string
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

export interface FormatBinding {
  id: string
  user_id: string
  trigger_condition: TriggerCondition
  format_to_apply: string
  priority: number
  created_at: string
}

export interface TierCheckResponse {
  tier: 'binding' | 'preset' | 'ml' | 'none'
  format?: string
  confidence?: number
  reason?: string
  feature_values?: Record<string, number>
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
}

export interface AIChatResponse {
  reply: string
  provider: string
  model: string
  mode?: 'chat' | 'preview'
  preview?: AIChatPreview | null
}

export type MCPToolName =
  | 'getDocumentContent'
  | 'applyFormatting'
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
  modifiedTime: string
  iconLink: string
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

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers = {
    ...options?.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    ...options,
    headers,
  })

  if (response.status === 204) {
    return null as T
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null)
    let errorMessage = 'Network response was not ok'
    if (
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'error' in errorBody &&
      typeof (errorBody as { error?: unknown }).error === 'string'
    ) {
      errorMessage = (errorBody as { error: string }).error
    } else {
      errorMessage = `HTTP ${response.status}: Request failed`
    }

    // Attach HTTP status code to error
    const err = new Error(errorMessage) as Error & { status?: number }
    err.status = response.status

    if (response.status === 401) {
      localStorage.removeItem('authToken')
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { status: 401, message: errorMessage } }))
    } else if (response.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:forbidden', { detail: { status: 403, message: errorMessage } }))
    }

    throw err
  }

  return response.json() as Promise<T>
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
    register: async (email: string, password: string, role: 'student' | 'professor' = 'student'): Promise<RegisterResponse> => {
      return fetchAPI<RegisterResponse>('auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
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
  },

  documents: {
    list: async (): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>('documents')
    },
    get: async (id: string): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}`)
    },
    create: async (title: string): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>('documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    },
    update: async (id: string, data: UpdateDocumentRequest): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}`, {
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
    /** Upload a local file (.docx, .txt, .html, .pdf) and create a document from it. */
    import: async (file: File): Promise<DocumentRecord> => {
      const formData = new FormData()
      formData.append('file', file)
      // Do NOT set Content-Type — browser sets the multipart boundary automatically
      return fetchAPI<DocumentRecord>('documents/import', {
        method: 'POST',
        body: formData,
      })
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
  },

  predictions: {
    predict: async (text: string, userId?: string): Promise<PredictionResponse> => {
      return fetchAPI<PredictionResponse>('predictions/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, user_id: userId }),
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
      rejectedFormattingPreviews?: RejectedFormattingPreview[]
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
        }),
      })
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
    create: async (name: string): Promise<FolderRecord> => {
      return fetchAPI<FolderRecord>('folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
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
    listFiles: async (): Promise<{ files: DriveFile[] }> => {
      return fetchAPI<{ files: DriveFile[] }>('drive/files')
    },
    exportFile: async (fileId: string): Promise<{ title: string; html: string }> => {
      return fetchAPI<{ title: string; html: string }>(`drive/files/${fileId}/export`)
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
    getPendingProfessors: async (): Promise<any[]> => {
      return fetchAPI<any[]>('admin/professors/pending')
    },
    verifyProfessor: async (userId: string, status: 'approved' | 'rejected', notes?: string): Promise<{ message: string }> => {
      return fetchAPI<{ message: string }>(`admin/professors/${userId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      })
    },
    getAllUsers: async (): Promise<any[]> => {
      return fetchAPI<any[]>('admin/users')
    },
    updateUserRole: async (userId: string, roleId: number): Promise<any> => {
      return fetchAPI<any>(`admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      })
    },
    getSystemReports: async (): Promise<any> => {
      return fetchAPI<any>('admin/reports')
    },
    deleteDocument: async (documentId: string): Promise<{ message: string }> => {
      return fetchAPI<{ message: string }>(`admin/documents/${documentId}`, {
        method: 'DELETE',
      })
    },
  },
}
