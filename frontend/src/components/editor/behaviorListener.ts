export interface BehaviorEventPayload {
  text?: string
  format?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
  payload?: BehaviorEventPayload
}

export function createBehaviorEvent(
  action: string,
  documentId: string,
  blockId?: string,
  payload?: BehaviorEventPayload
): BehaviorEvent {
  return {
    action,
    timestamp: new Date().toISOString(),
    documentId,
    blockId,
    payload,
  }
}