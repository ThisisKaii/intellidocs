import { Request, Response } from "express";
import { appendBehaviorEvent } from "../models/behaviorModel";
import { BehaviorEvent } from "../types/index";
import { runAggregatorOnce } from "../skills/runAggregator";
import { runFeatureExtractorOnce } from "../skills/featureExtractor";
import { runFeatureExportOnce } from "../skills/featureExport";

// Log a behavior event to Redis
export async function logBehaviorEvent(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as BehaviorEvent

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" })
      return
    }

    if (!body?.action || !body?.timestamp || !body?.documentId) {
      res.status(400).json({ error: 'Invalid behavior event payload' })
      return
    }

    await appendBehaviorEvent(userId, body)
    res.status(202).json({ message: "Behavior event logged" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ message: message })
  }
}

// Trigger DuckDB aggregation manually, then refresh features
export async function triggerAggregation(req: Request, res: Response): Promise<void> {
  try {
    const aggregation = await runAggregatorOnce()
    const features = await runFeatureExtractorOnce()
    res.status(200).json({
      status: 'ok',
      aggregation: {
        stdout: aggregation.stdout.trim(),
        stderr: aggregation.stderr.trim(),
      },
      features: {
        stdout: features.stdout.trim(),
        stderr: features.stderr.trim(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

// Trigger feature extraction manually
export async function triggerFeatureExtraction(req: Request, res: Response): Promise<void> {
  try {
    const result = await runFeatureExtractorOnce()
    res.status(200).json({
      status: 'ok',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

// Export features to CSV/Parquet manually
export async function triggerFeatureExport(req: Request, res: Response): Promise<void> {
  try {
    const result = await runFeatureExportOnce()
    res.status(200).json({
      status: 'ok',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}
