import { Request, Response } from "express";
import { appendBehaviorEvent, getBehaviorEvents } from "../models/behaviorModel";
import { BehaviorEvent, BehaviorSummaryLatestEvent, BehaviorSummaryResponse } from "../types/index";
import { runAggregatorOnce } from "../skills/runAggregator";
import { runFeatureExtractorOnce } from "../skills/featureExtractor";
import { runFeatureExportOnce } from "../skills/featureExport";

// Increment a count bucket for behavior summary values
function incrementCount(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1
}

// Extract a format key from a prefixed behavior action
function extractFormatFromAction(action: string, prefix: string): string | null {
  if (!action.startsWith(prefix)) {
    return null
  }

  const value = action.slice(prefix.length).trim()
  return value.length > 0 ? value : null
}

// Build a behavior summary payload from Redis behavior events
function buildBehaviorSummary(
  documentId: string,
  events: BehaviorSummaryLatestEvent[],
): BehaviorSummaryResponse {
  const formatActions: Record<string, number> = {}
  const chatPreviewAccepted: Record<string, number> = {}
  const chatPreviewRejected: Record<string, number> = {}

  for (const event of events) {
    const acceptedFormat = extractFormatFromAction(event.action, 'chat_preview_accepted:')
    const rejectedFormat = extractFormatFromAction(event.action, 'chat_preview_rejected:')

    if (acceptedFormat) {
      incrementCount(chatPreviewAccepted, acceptedFormat)
      continue
    }

    if (rejectedFormat) {
      incrementCount(chatPreviewRejected, rejectedFormat)
      continue
    }

    incrementCount(formatActions, event.action)
  }

  const latestEvents = events
    .slice(-10)
    .reverse()
    .map((event) => ({
      action: event.action,
      timestamp: event.timestamp,
      documentId: event.documentId,
      userId: event.userId,
    }))

  return {
    documentId,
    totalEvents: events.length,
    formatActions,
    chatPreviewAccepted,
    chatPreviewRejected,
    latestEvents,
  }
}

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

// Return a summary of behavior events for the current user's document
export async function getBehaviorSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const documentId = req.params.documentId?.trim()

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" })
      return
    }

    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    const events = await getBehaviorEvents(userId, documentId)
    const summary = buildBehaviorSummary(documentId, events)
    res.status(200).json(summary)
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
