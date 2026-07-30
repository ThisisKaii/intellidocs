export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
}

export function createBehaviorEvent(action: string, documentId: string, blockId?: string): BehaviorEvent {
  return {
    action,
    timestamp: new Date().toISOString(),
    documentId,
    blockId,
  }
}
