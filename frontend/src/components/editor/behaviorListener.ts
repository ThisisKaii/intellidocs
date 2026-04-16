export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
}

export function createBehaviorEvent(action: string, documentId: string): BehaviorEvent {

  return {
    action,
    timestamp: new Date().toISOString(),
    documentId,
  }
}
