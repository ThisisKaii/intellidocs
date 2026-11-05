import { createFeedbackRecord, type CreateFeedbackParams } from '../models/feedbackModel'
import { appendDocumentBehaviorEvent } from '../models/behaviorModel'

export interface ProcessFeedbackInput {
  userId: string
  documentId?: string
  predictionType: 'format_prompt' | 'suggestion_panel' | 'chat_preview'
  predictedFormat: string
  confidence?: number
  accepted: boolean
}

/**
 * Process and record AI prediction feedback across Supabase and Redis behavior stream.
 * Single-purpose skill invoked when a user accepts or rejects a formatting suggestion.
 */
export async function processAIFeedback(
  input: ProcessFeedbackInput
): Promise<void> {
  const { userId, documentId, predictionType, predictedFormat, confidence, accepted } = input

  // 1. Save structured feedback record to Supabase
  const feedbackParams: CreateFeedbackParams = {
    userId,
    documentId,
    predictionType,
    predictedFormat,
    confidence,
    accepted,
  }
  await createFeedbackRecord(feedbackParams)

  // 2. Buffer real-time event to Redis behavior stream for DuckDB aggregation. Feedback with no
  //    document has no genre, so it is kept in Supabase only and never enters training data.
  if (!documentId) return

  const actionName = accepted
    ? `ai_suggestion_accepted:${predictedFormat}`
    : `ai_suggestion_rejected:${predictedFormat}`

  await appendDocumentBehaviorEvent(userId, {
    documentId,
    action: actionName,
    timestamp: new Date().toISOString(),
    payload: {
      predictionType,
      predictedFormat,
      confidence,
      accepted,
    },
  })
}

