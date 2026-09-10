import { Request, Response } from 'express'
import { aiClient } from '../ai/aiClient'
import { buildAIChatSystemPrompt } from '../ai/prompts/systemPrompts'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { buildChatContext } from '../skills/buildChatContext'
import { parseFormattingIntent } from '../skills/parseFormattingIntent'

interface ErrorWithStatus {
  status?: number
}

interface AIChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RejectedFormattingPreview {
  format: string
  reason?: string
  rejectedAt?: string
}

interface AIChatBody {
  message: string
  documentId?: string
  documentTitle?: string
  documentContent?: string
  history?: AIChatMessage[]
  rejectedFormattingPreviews?: RejectedFormattingPreview[]
}

interface AIProviderSummary {
  provider: string
  model: string
}

interface FormattingPreview {
  format: string
  label: string
  confidence: number
  reason: string
  /** Every requested format (e.g. ["bold", "italic"] for "make everything bold italic"). */
  formats?: string[]
  /** Document scope: current selection or the whole document. */
  scope?: 'selection' | 'all'
  /** Explicit font size in points, e.g. "font size 20". */
  fontSize?: number | null
}

/** Read the active AI provider summary from the environment. */
function getProviderSummary(): AIProviderSummary {
  return {
    provider: process.env.AI_PROVIDER ?? 'unknown',
    model: process.env.AI_MODEL ?? 'unknown',
  }
}



/** Convert recent chat history into provider-ready messages. */
function buildHistoryMessages(
  history: AIChatMessage[] | undefined
): { role: 'user' | 'assistant'; content: string }[] {
  return (history ?? [])
    .filter((entry) => entry.content.trim().length > 0)
    .slice(-8)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim(),
    }))
}

/** Build preview metadata for formatting-style chat requests. */
function detectFormattingPreview(message: string): FormattingPreview | null {
  const intent = parseFormattingIntent(message)
  const hasFormats = intent.formats.length > 0
  const hasFontSize = intent.fontSize !== null

  if (!hasFormats && !hasFontSize) {
    return null
  }

  const labels: Record<string, string> = {
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    blockquote: 'Blockquote',
    unordered_list: 'Bullet List',
    ordered_list: 'Numbered List',
  }

  const primary = intent.formats[0]
  const reasonParts: string[] = []
  if (intent.matchedPhrase) {
    reasonParts.push(`Detected formatting intent from "${intent.matchedPhrase}".`)
  }
  if (hasFontSize) {
    reasonParts.push(`Font size ${intent.fontSize}pt requested.`)
  }
  if (intent.scope === 'all') {
    reasonParts.push('Applies to the whole document.')
  }

  return {
    format: primary ?? 'body_text',
    label: primary ? (labels[primary] ?? primary) : 'Font size',
    confidence: intent.confidence,
    reason: reasonParts.length > 0 ? reasonParts.join(' ') : 'Detected a likely formatting request.',
    formats: intent.formats,
    scope: intent.scope,
    fontSize: intent.fontSize,
  }
}

/** Handle authenticated AI chatbot requests. */
export async function chatWithAI(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as AIChatBody
    const message = body.message?.trim()

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!message) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    const quota = await consumeAIQuota(userId, 'chat')
    if (!quota.allowed) {
      res.status(429).json({
        error: 'AI request quota exceeded',
        quota: {
          limit: quota.limit,
          remaining: quota.remaining,
          resetInSeconds: quota.resetInSeconds,
        },
      })
      return
    }

    const preview = detectFormattingPreview(message)

    const reply = await aiClient.chat(
      [
        ...buildHistoryMessages(body.history),
        { role: 'user', content: message },
      ],
      buildAIChatSystemPrompt({
        documentContext: buildChatContext(body),
        rejectedFormattingPreviews: body.rejectedFormattingPreviews ?? [],
      })
    )

    const providerSummary = getProviderSummary()

    res.status(200).json({
      reply,
      provider: providerSummary.provider,
      model: providerSummary.model,
      mode: preview ? 'preview' : 'chat',
      preview: preview
        ? {
            format: preview.format,
            label: preview.label,
            confidence: preview.confidence,
            reason: preview.reason,
            formats: preview.formats,
            scope: preview.scope,
            fontSize: preview.fontSize,
          }
        : null,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI chat request failed'
    const status =
      typeof (error as ErrorWithStatus | undefined)?.status === 'number'
        ? (error as ErrorWithStatus).status as number
        : 500

    res.status(status).json({ error: message })
  }
}

/** Handle logging of AI formatting prediction feedback. */
export async function logAIFeedback(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const body = req.body as {
      documentId?: string
      predictionType: 'format_prompt' | 'suggestion_panel' | 'chat_preview'
      predictedFormat: string
      confidence?: number
      accepted: boolean
    }

    const { processAIFeedback } = await import('../skills/feedbackLoop')

    await processAIFeedback({
      userId,
      documentId: body.documentId,
      predictionType: body.predictionType,
      predictedFormat: body.predictedFormat,
      confidence: body.confidence,
      accepted: body.accepted,
    })

    res.status(201).json({ status: 'ok', message: 'Feedback logged successfully' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log AI feedback'
    res.status(500).json({ error: message })
  }
}

/** Trigger per-user supervised fine-tuning if minimum feedback threshold is met. */
export async function triggerUserFineTune(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { getFeedbackAccuracyStats } = await import('../models/feedbackModel')
    const stats = await getFeedbackAccuracyStats(userId)

    if (stats.totalPredictions < 5) {
      res.status(400).json({
        error: 'Not enough feedback data',
        message: `${stats.totalPredictions}/5 predictions recorded. Continue using the editor to collect more feedback before fine-tuning.`,
      })
      return
    }

    const { triggerFineTune } = await import('../ai/bridge/pythonBridge')
    const result = await triggerFineTune(userId)

    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fine-tune trigger failed'
    res.status(500).json({ error: message })
  }
}
