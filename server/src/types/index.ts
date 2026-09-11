// Administrator Role — Finalized System Architecture
// Role Hierarchy: student, professor (requires admin approval), admin (system management)

export type RoleName = 'student' | 'professor' | 'admin'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

/** Page-number style for headers/footers. */
export type PageNumberFormat = 'none' | 'number' | 'roman'

/** Page size presets supported by the editor. */
export type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

/** Page orientation. */
export type PageOrientation = 'portrait' | 'landscape'

/** Page margins in inches. */
export interface MarginValues {
  top: number
  bottom: number
  left: number
  right: number
}

/** Page layout (size, orientation, margins) stored with each document. */
export interface PageSetup {
  page_size: PageSizeKey
  orientation: PageOrientation
  margins: MarginValues
}

export interface Document {
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
  is_deleted: boolean
  deleted_at: string | null
  share_permission?: SharePermission
  share_token?: string | null
  share_expires_at?: string | null
  shared_by?: string
  created_at: string
  updated_at: string
}

export interface Folder {
  folder_id: string
  user_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateDocumentRequest {
  title: string
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
}

export interface UpdateDocumentRequest {
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

// ── Three-tier formatting control system ────────────────────────────────────
// Tier 1: presets (system-wide predefined rule sets)
// Tier 2: custom bindings (per-user hard rules)
// Tier 3: ML-based auto formatting (prediction)

/** Jsonb trigger condition evaluated against the current text block. */
export interface TriggerCondition {
  maxWords?: number
  minWords?: number
  maxChars?: number
  standaloneLine?: boolean
  startsWith?: string
  contains?: string
}

/** A single formatting rule: condition + format to apply + priority. */
export interface FormatRule {
  condition: TriggerCondition
  format: string
  priority: number
}

/** Tier 1 preset — a named, predefined set of formatting rules. */
export interface FormatPreset {
  id: string
  key: string
  name: string
  description: string
  rules: FormatRule[]
  is_system: boolean
}

/** Tier 2 custom binding — a user-defined hard formatting rule. */
export interface FormatBinding {
  id: string
  user_id: string
  trigger_condition: TriggerCondition
  format_to_apply: string
  priority: number
  created_at: string
}

export interface CreateFormatBindingRequest {
  trigger_condition: TriggerCondition
  format_to_apply: string
  priority: number
}

export interface UpdateFormatBindingRequest {
  trigger_condition?: TriggerCondition
  format_to_apply?: string
  priority?: number
}

/** Result of the three-tier resolution for a text block. */
export interface TierCheckResult {
  tier: 'binding' | 'preset' | 'none'
  format?: string
  reason?: string
}

export interface UserProfile {
  id: string
  user_id: string
  role_id: number
  role_name?: RoleName
  verification_status: VerificationStatus
  display_name: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface PendingProfessorApplicant {
  profile_id: string
  user_id: string
  email: string
  display_name: string | null
  role_name: string
  verification_status: VerificationStatus
  applied_at: string
}

export interface VerifyProfessorRequest {
  status: 'approved' | 'rejected'
  notes?: string
}

export type SharePermission = 'view' | 'comment' | 'edit'

/** A document share row (owner grants access to a collaborator). */
export interface DocumentShare {
  share_id: string
  document_id: string
  owner_id: string
  shared_with: string | null
  pending_email: string | null
  permission: SharePermission
  shared_at: string
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

export interface Notification {
  notification_id: string
  user_id: string
  type: string
  title: string
  message: string
  read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
  payload?: Record<string, unknown>
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

export interface PredictionRequest {
  text: string
  user_id?: string
  block_id?: string
}

export interface PredictionResponse {
  predicted_format: string
  confidence: number
}

export type DocumentResponse = Document
