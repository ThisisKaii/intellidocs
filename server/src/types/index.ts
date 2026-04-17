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
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
}

export type DocumentResponse = Document
