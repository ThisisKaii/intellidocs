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
}

export interface PredictionResponse {
  predicted_format: string
  confidence: number
}

export type DocumentResponse = Document
