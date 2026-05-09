import { requestAggregation } from '../ai/bridge/pythonBridge'
import type { PipelineAggregateResponse } from '../ai/bridge/pythonBridge'

/** Trigger the Redis → DuckDB aggregation pipeline via the ML service. */
export async function runAggregatorOnce(): Promise<PipelineAggregateResponse> {
  try {
    return await requestAggregation()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Aggregator failed: ${message}`)
  }
}
