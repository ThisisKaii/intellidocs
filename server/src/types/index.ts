// Administrator Role — Finalized System Architecture
// Role Hierarchy: student, professor (requires admin approval), admin (system management)

export type RoleName = 'student' | 'professor' | 'admin'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface Document {
  id: string
  user_id: string
  title: string
  content: string
  formatting_history: unknown[]
  is_isolated: boolean
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
}

export interface UpdateDocumentRequest {
  title?: string
  content?: string
  formatting_history?: string[]
  is_isolated?: boolean
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
