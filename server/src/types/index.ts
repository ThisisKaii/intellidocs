// TODO: Administrator Role — Scope is NOT finalized.
// Unclear whether "admin" means:
//   (a) System-wide admin (managing all users, all documents, platform-wide moderation)
//   (b) Document-level admin (document owner managing collaborators/permissions)
// Do NOT build admin tables, RLS policies, or UI until this is clarified.

// TODO: Real-Time Collaboration — Yjs CRDT + WebSocket
// - Replace documents.content (text blob) with yjs_state (binary/bytea)
// - Add y-websocket server alongside Express
// - Bind Yjs doc to frontend contentEditable editor

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
  display_name: string | null
  phone: string | null
  created_at: string
  updated_at: string
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
}

export interface PredictionResponse {
  predicted_format: string
  confidence: number
}

export type DocumentResponse = Document
