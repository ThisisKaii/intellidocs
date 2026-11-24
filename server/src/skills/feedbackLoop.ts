import { createFeedbackRecord, type CreateFeedbackParams } from '../models/feedbackModel'
import { appendDocumentBehaviorEvent } from '../models/behaviorModel'
import { maybeStartPersonalization } from './personalizationTrigger'

export interface ProcessFeedbackInput {
  userId: string
  documentId?: string
  predictionType: 'format_prompt' | 'suggestion_panel' | 'chat_preview'
  predictedFormat: string
  confidence?: number
  accepted: boolean
  /** The block the suggestion was for, and on a rejection the format it kept (see feedbackModel). */
  blockText?: string
  keptFormat?: string
}

/**
 * Process and record AI prediction feedback across Supabase and Redis behavior stream.
 * Single-purpose skill invoked when a user accepts or rejects a formatting suggestion.
 */
export async function processAIFeedback(
  input: ProcessFeedbackInput
): Promise<void> {
  const { userId, documentId, predictionType, predictedFormat, confidence, accepted, blockText, keptFormat } = input

  // 1. Save structured feedback record to Supabase
  const feedbackParams: CreateFeedbackParams = {
    userId,
    documentId,
    predictionType,
    predictedFormat,
    confidence,
    accepted,
    ...(blockText !== undefined ? { blockText } : {}),
    ...(keptFormat !== undefined ? { keptFormat } : {}),
  }
  await createFeedbackRecord(feedbackParams)

  // A labeled block can retrain the user's own model: at 5 of them, then every 10 more, a
  // personalization run starts in the background (this request does not wait for it).
  if (blockText !== undefined) {
    maybeStartPersonalization(userId).catch((error: unknown) =>
      console.warn('Could not check for a personalization run:', error instanceof Error ? error.message : error)
    )
  }

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

