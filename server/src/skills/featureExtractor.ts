import { requestFeatureExtraction } from '../ai/bridge/pythonBridge'
import type { PipelineExtractResponse } from '../ai/bridge/pythonBridge'

/** Trigger feature extraction on DuckDB via the ML service. */
export async function runFeatureExtractorOnce(): Promise<PipelineExtractResponse> {
  try {
    return await requestFeatureExtraction()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Feature extractor failed: ${message}`)
  }
}
