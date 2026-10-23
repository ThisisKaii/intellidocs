import { Request, Response } from 'express'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { consumeAIQuota } from '../models/aiQuotaModel'

// Audit report: summarises formatting behaviour for a document so the
// researcher can review what the system inferred during the session.
export async function buildFormattingAudit(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const documentId = req.params.documentId
    const from = req.query.from as string
    const to = req.query.to as string

    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    const quota = await consumeAIQuota(userId, 'formatting-audit')
    if (!quota.allowed) {
      res.status(429).json({ error: 'AI request quota exceeded' })
      return
    }

    // Pull the raw events straight from the events table so the audit sees
    // everything the aggregation job has not flushed into DuckDB yet.
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_KEY as string
    )

    let query = supabase
      .from('behavior_events')
      .select('*')
      .eq('document_id', documentId)

    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    const events: any = data ?? []
    const byFormat: Record<string, number> = {}
    events.forEach((event: any) => {
      const key = event.format || 'unknown'
      byFormat[key] = (byFormat[key] ?? 0) + 1
    })

    const top = Object.keys(byFormat)
      .sort((a, b) => byFormat[b] - byFormat[a])
      .slice(0, 5)
      .map((format) => ({ format, count: byFormat[format] }))

    res.status(200).json({
      documentId,
      totalEvents: events.length,
      topFormats: top,
      summary:
        'Across this document the model leaned toward ' +
        (top[0]?.format ?? 'no single format') +
        '. Review the highest-frequency choices first.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Audit failed'
    res.status(500).json({ error: message })
  }
}