import { countFeedbackTrainingExamples, listFeedbackTrainingExamples } from '../models/feedbackModel'
import { requestAggregation, triggerFineTune } from '../ai/bridge/pythonBridge'

/** A user's own model is first trained at this many labeled blocks, then again every RETRAIN_EVERY more. */
export const FIRST_TRAINING_AT = 5
export const RETRAIN_EVERY = 10

/** Users whose personalization run has started and not finished, so feedback in a burst starts one run. */
const running = new Set<string>()

/** Whether this count of labeled blocks is one at which the user's model is (re)trained: 5, 15, 25, ... */
export function isTrainingPoint(count: number): boolean {
  return count === FIRST_TRAINING_AT || (count > FIRST_TRAINING_AT && (count - FIRST_TRAINING_AT) % RETRAIN_EVERY === 0)
}

/**
 * Bring the user's behavior into DuckDB and fine-tune their models on everything they have labelled:
 * the editing events the LSTM learns from are aggregated first (Redis -> DuckDB), then the labeled
 * blocks are sent to the ML service, which trains the user's RandomForest (and LSTM) per genre.
 * A failed aggregation does not stop the RandomForest, which learns from the labeled blocks alone.
 */
export async function runPersonalization(userId: string): Promise<{ status: string; message: string }> {
  try {
    await requestAggregation()
  } catch (error) {
    console.warn('Behavior aggregation before fine-tuning failed:', error instanceof Error ? error.message : error)
  }
  const examples = await listFeedbackTrainingExamples(userId)
  return triggerFineTune(userId, examples)
}

/**
 * After a labeled feedback record: start the user's personalization when their labeled blocks reach
 * a training point. It runs in the background (the feedback request does not wait for it) and at
 * most once at a time per user. Returns whether a run was started.
 */
export async function maybeStartPersonalization(userId: string): Promise<boolean> {
  if (running.has(userId)) return false
  const count = await countFeedbackTrainingExamples(userId)
  if (!isTrainingPoint(count)) return false
  running.add(userId)
  runPersonalization(userId)
    .catch((error: unknown) => console.warn('Personalization run failed:', error instanceof Error ? error.message : error))
    .finally(() => running.delete(userId))
  return true
}
