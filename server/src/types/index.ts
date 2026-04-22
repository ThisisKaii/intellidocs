export interface Document {
  id: string
  user_id: string
  title: string
  content: string
  formatting_history: unknown[]
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
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
}

export interface PredictionRequest {
  text: string
}

export interface PredictionResponse {
  predicted_format: string
  confidence: number
}

export type DocumentResponse = Document
