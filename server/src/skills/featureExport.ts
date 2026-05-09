import { requestFeatureExport } from '../ai/bridge/pythonBridge'
import type { PipelineExportResponse } from '../ai/bridge/pythonBridge'

/** Trigger feature export (CSV + Parquet) via the ML service. */
export async function runFeatureExportOnce(): Promise<PipelineExportResponse> {
  try {
    return await requestFeatureExport()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Feature export failed: ${message}`)
  }
}