// Administrator Role — Finalized System Architecture
// Role Hierarchy: student, professor (requires admin approval), admin (system management)

export type RoleName = 'student' | 'professor' | 'admin'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

/** Signed-in user's own storage usage versus their account quota. */
export interface StorageSummary {
  usedBytes: number
  quotaBytes: number
  role: RoleName
}

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
  /** Header/footer art, per-section headers and page numbering from an import (migration 032). */
  page_layout?: PageLayout | null
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
  /** 'personal' is the owner's private workspace; 'class' is shared with students. */
  folder_type?: FolderType
  /** Course code, only present on class folders (e.g. 'CS-201'). */
  class_code?: string | null
  /** Term the class folder was created for (e.g. '2026-T1'). */
  academic_term?: string | null
  /** Private code students type to join a class folder; only returned to the folder owner. */
  join_code?: string | null
  /** Number of documents enrolled students have submitted into a class folder. */
  submission_count?: number
  /** Number of students enrolled in a class folder. */
  enrolled_count?: number
}

/** A folder is either the owner's private workspace or a shared class folder. */
export type FolderType = 'personal' | 'class'

/** One enrolled student in a class folder. */
export interface ClassEnrollment {
  folder_id: string
  student_id: string
  enrolled_at: string
  /** Email from Supabase Auth, for display in the roster. */
  email?: string | null
  /** Display name from Supabase Auth, for display in the roster. */
  display_name?: string | null
}

export interface CreateDocumentRequest {
  title: string
  /** Number the title "Name (1)", "Name (2)" when the user already has that name (imports). */
  unique_title?: boolean
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
  /** Blueprint key to bind at creation, e.g. 'apa_7th' or a user preset key. */
  formatting_preset?: string
  page_layout?: PageLayout
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
  page_layout?: PageLayout | null
  citation_data?: CitationData
}

/** One Word section's header/footer choice and page numbering. */
export interface PageLayoutSection {
  index: number
  header: string | null
  footer: string | null
  first_header: string | null
  first_footer: string | null
  title_pg: boolean
  number_start: number | null
  number_format: string
  header_distance: number
  footer_distance: number
}

/** What an import keeps of a document's page furniture beyond header/footer text. */
export interface PageLayout {
  sections: PageLayoutSection[]
  /** Distinct header/footer parts: flowing HTML plus pictures positioned from the page corner. */
  parts: Record<string, { flow: string; art: string }>
  /** Pictures repeated on several pages (running letterhead, footer logos). */
  repeat_art: string
  /** Pictures that belong to one page, by 1-based page number. */
  page_art: Record<string, string>
}

/** A document's citation style and saved references. */
export interface CitationData {
  style: 'ieee' | 'apa' | 'mla' | 'chicago'
  references: Array<CitationLookupResult & { id: string; cited?: number }>
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

/**
 * A standard blueprint forked by one user. Standard presets are never edited
 * in place — customising "APA 7th Edition" produces "APA 7th Edition (Custom
 * v2)" here so every other document on the standard key stays untouched.
 */
export interface UserPreset {
  preset_id: string
  user_id: string
  /** Unique per user, e.g. 'apa_7th__v2'. */
  key: string
  /** Key of the standard blueprint this was forked from. */
  base_key: string
  name: string
  description: string
  rules: FormatRule[]
  /** 2 for the first fork of a base, 3 for the next, and so on. */
  version: number
  created_at: string
  updated_at: string
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

/** Payload for forking a standard blueprint into a personal preset. */
export interface CreateUserPresetRequest {
  /** Key of the standard blueprint to fork, e.g. 'apa_7th'. */
  baseKey: string
  /** Defaults to "<Base name> (Custom vN)" when omitted. */
  name?: string
  description?: string
  /** Overrides the base rules; defaults to the base blueprint's own rules. */
  rules?: FormatRule[]
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

/** Application metadata attached to a pending verification applicant. */
export interface ApplicantDetails {
  applicantType?: string | null
  college?: string | null
  department?: string | null
  facultyId?: string | null
  institutionalEmail?: string | null
  studentId?: string | null
  degreeProgram?: string | null
  reason?: string | null
  submittedAt?: string | null
}

/** A pending Student or Professor applicant in the admin verification queue. */
export interface AdminApplicant {
  profile_id: string
  user_id: string
  email: string | null
  display_name: string | null
  applied_role: RoleName
  verification_status: VerificationStatus
  applied_at: string
  application_details: ApplicantDetails
}

export interface VerifyApplicantRequest {
  status: 'approved' | 'rejected'
  role?: RoleName
  notes?: string
}

/** A user row in the admin directory with email and document stats. */
export interface AdminUserRecord {
  id: string
  user_id: string
  role_id: number
  role_name: RoleName | null
  verification_status: VerificationStatus
  display_name: string | null
  email: string | null
  phone: string | null
  document_count: number
  created_at: string
  updated_at: string
}

/** A document row visible only to admins during moderation. */
export interface AdminDocumentRecord {
  id: string
  title: string
  user_id: string
  email: string | null
  is_deleted: boolean
  revision_count: number
  created_at: string
  updated_at: string
}

/** Platform-wide health metrics returned to the admin reports tab. */
export interface SystemReport {
  totalUsers: number
  pendingApplicants: number
  byRole: Record<RoleName, number>
  totalDocuments: number
  activeDocuments: number
  softDeletedDocuments: number
  totalFormattingActions: number
  feedback: {
    total: number
    accepted: number
    rejected: number
    acceptanceRate: string
    byType: Record<string, { total: number; accepted: number; rejected: number; acceptanceRate: string }>
  }
  generatedAt: string
}

/** Weekly activity series and breakdowns shown as charts on the admin reports tab. */
export interface ReportTimeseries {
  weeks: number
  signups: Array<{ week: string; count: number }>
  documents: Array<{ week: string; count: number }>
  scans: Array<{ week: string; count: number }>
  /** Share of scans in the window that scored below the originality threshold. */
  flaggedScans: number
  totalScans: number
  applicationsByStatus: Record<VerificationStatus, number>
  generatedAt: string
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

export interface FormatBehaviorPayload {
  text?: string
  format?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
  /** Set when the format came from accepting a suggestion; excluded from learning. */
  fromSuggestion?: boolean
  tableRows?: number
  tableCols?: number
  tableAlignment?: 'left' | 'center' | 'right'
  tableHasHeader?: boolean
  imageWidth?: number
  imageHeight?: number
  imageAlignment?: 'left' | 'center' | 'right' | 'float'
  imageHasCaption?: boolean
  blockType?: string
  blockIndent?: number
  codeLanguage?: string
  contextNode?: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
  payload?: FormatBehaviorPayload & Record<string, unknown>
  /** Characters affected by composition events (type/paste/backspace). */
  char_count?: number
  /** Document position where a composition event happened. */
  position?: number
  /** Document size at event time, for position normalisation. */
  doc_size?: number
}

export interface LearnedFormatPattern {
  format: string
  snippet: string
  bold: boolean
  italic: boolean
  underline: boolean
  fontSize: number | null
  textAlign?: string
  count: number
  lastAt: string
}

export interface LearnedFormatMatch {
  format: string
  snippet: string
  bold: boolean
  italic: boolean
  underline: boolean
  fontSize: number | null
  textAlign?: string
  confidence: number
  count: number
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

/** A snapshot of a document saved at a point in time. */
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

/** Format state captured with a version snapshot (stored in editor_prefs). */
export interface FormatSnapshot {
  formatting_history: string[]
  formatting_preset: string | null
  header_content: string
  footer_content: string
  show_header: boolean
  show_footer: boolean
  header_number_format: PageNumberFormat
  footer_number_format: PageNumberFormat
}

/** Outcome of one Tier 1 deterministic compliance rule. */
export type ComplianceStatus = 'pass' | 'warn' | 'fail'

/** One Tier 1 compliance check as reported to the dashboard. */
export interface ComplianceCheck {
  id: string
  name: string
  category: string
  status: ComplianceStatus
  detail: string
  suggestion: string
  weight: number
  required: boolean
}

/** RandomForest paragraph-style consistency detail from Tier 2. */
export interface StyleConsistencyResult {
  score: number
  paragraphsAnalyzed: number
  agreements: number
  meanConfidence: number
  mismatches: { text: string; observed: string; predicted: string }[]
}

/** LSTM document-flow consistency detail from Tier 2. */
export interface FlowConsistencyResult {
  score: number
  transitions: number
  expectedNext: string
  observedNext: string
  agrees: boolean
}

/** Hybrid compliance audit report combining both scoring tiers. */
export interface ComplianceReport {
  aggregateScore: number
  ruleScore: number
  /** Null when the Tier 2 models are not installed. */
  mlScore: number | null
  ruleWeight: number
  mlWeight: number
  ready: boolean
  readinessThreshold: number
  blockingIssues: string[]
  summary: {
    passed: number
    warned: number
    failed: number
    paragraphs: number
  }
  checks: ComplianceCheck[]
  ml: {
    available: boolean
    score: number | null
    unavailableReason: string | null
    style: StyleConsistencyResult | null
    flow: FlowConsistencyResult | null
  }
}

/** A source reference found by a citation lookup, ready to fill the reference form. */
export interface CitationLookupResult {
  type: 'journal' | 'book' | 'conference' | 'website' | 'thesis' | 'report' | 'other'
  authors: string[]
  title: string
  year: number
  venue?: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  url?: string
  publisher?: string
}
