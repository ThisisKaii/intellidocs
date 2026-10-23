import { Request, Response } from 'express'
import { aiClient } from '../ai/aiClient'
import { buildAIChatSystemPrompt } from '../ai/prompts/systemPrompts'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { buildChatContext } from '../skills/buildChatContext'
import { parseFormattingIntent } from '../skills/parseFormattingIntent'
import { buildFormattingReply } from '../skills/buildFormattingReply'
import { documentHasTarget, listOutlineSections } from '../skills/documentSections'
import { retrieveSections, splitIntoSections, type DocumentSection } from '../skills/retrieveDocumentSections'
import { getDocumentForUser } from '../models/documentModel'
import { listFeedbackRows } from '../models/feedbackModel'
import { summarizeLearning } from '../skills/summarizeLearning'

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
  /** The most recent formatting preview this user saw, for follow-up resolution. */
  lastPreview?: AIChatPreviewContext | null
}

/** Compact snapshot of a previously shown formatting preview (from the client). */
interface AIChatPreviewContext {
  format?: string
  formats?: string[]
  scope?: 'selection' | 'all'
  fontSize?: number | null
  target?: string | null
  targetMode?: 'literal' | 'section' | 'title' | null
  normalize?: boolean
  targetCategory?: 'headings' | 'paragraphs' | 'chapters' | 'all' | null
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
  /** Chapter/section reference like "chapter 1" the change should target. */
  target?: string | null
  /** How the target is meant: literal words, a whole section, or the document title. */
  targetMode?: 'literal' | 'section' | 'title' | null
  /** Block category a bulk request targets: headings, paragraphs, chapter headings, or all. */
  targetCategory?: 'headings' | 'paragraphs' | 'chapters' | 'all' | null
  /** True when the change clears existing formatting (revert to normal). */
  normalize?: boolean
  /** Deterministic reply when no provider call is needed (confirmations/follow-ups). */
  shortCircuitReply?: string | null
}

/** Words that confirm a previously shown preview. */
const CONFIRMATION_PHRASES = [
  'i want the latter',
  'the latter',
  'latter',
  'yes do it',
  'yes do that',
  'yes apply',
  'yes please',
  'go ahead',
  'apply it',
  'apply',
  'confirm',
  'do it',
  'yes',
  'yeah',
  'okay',
  'ok',
  'sounds good',
]

/**
 * Phrases that ask for the previous formatting change over the remaining text.
 * These have no format keyword of their own, so they inherit the last preview.
 */
const CONTINUATION_PHRASES = [
  'format the rest',
  'do the rest',
  'format the remaining',
  'do the remaining',
  'format the remainder',
  'format everything else',
  'format all of it',
]

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
function detectFormattingPreview(
  message: string,
  lastPreview: AIChatPreviewContext | null | undefined
): FormattingPreview | null {
  const intent = parseFormattingIntent(message)
  const normalized = message.toLowerCase().trim()
  const hasFormats = intent.formats.length > 0
  const hasFontSize = intent.fontSize !== null

  // "Format the rest" style continuations inherit the previous preview and
  // widen it to the whole document. The deterministic reply keeps this flow
  // independent of the AI provider.
  const isContinuation =
    lastPreview !== null &&
    lastPreview !== undefined &&
    !hasFormats &&
    !hasFontSize &&
    !intent.normalize &&
    !intent.target &&
    CONTINUATION_PHRASES.some((phrase) => normalized.includes(phrase))

  if (isContinuation) {
    const inheritedFormats =
      lastPreview.formats && lastPreview.formats.length > 0
        ? lastPreview.formats
        : lastPreview.format
          ? [lastPreview.format]
          : []
    if (inheritedFormats.length > 0 || lastPreview.fontSize) {
      return {
        format: inheritedFormats[0] ?? lastPreview.format ?? 'body_text',
        label: labelForFormat({ ...lastPreview, formats: inheritedFormats }),
        confidence: 0.92,
        reason: 'Continuing your previous formatting change across the rest of the document.',
        formats: inheritedFormats,
        scope: 'all',
        fontSize: lastPreview.fontSize ?? null,
        target: null,
        targetCategory: 'all',
        normalize: lastPreview.normalize ?? false,
        shortCircuitReply:
          'Applying your previous formatting to the rest of the document. Confirm or reject below.',
      }
    }
  }

  // A pure confirmation ("latter", "yes", "do it") reuses the previous preview
  // so the accept/reject prompt stays available instead of a rambling reply.
  const isConfirmation =
    lastPreview !== null &&
    lastPreview !== undefined &&
    !hasFormats &&
    !hasFontSize &&
    !intent.normalize &&
    !intent.target &&
    CONFIRMATION_PHRASES.some((phrase) => normalized.includes(phrase))

  if (isConfirmation) {
    return {
      format: lastPreview.format ?? lastPreview.formats?.[0] ?? 'body_text',
      label: labelForFormat(lastPreview),
      confidence: 0.99,
      reason: 'Continuing your previous formatting change — confirm to apply it.',
      formats: lastPreview.formats ?? [],
      scope: lastPreview.scope ?? 'selection',
      fontSize: lastPreview.fontSize ?? null,
      target: lastPreview.target ?? null,
      targetCategory: lastPreview.targetCategory ?? null,
      normalize: lastPreview.normalize ?? false,
      shortCircuitReply: 'Got it — here is your formatting change again. Confirm or reject below, or tell me what to adjust.',
    }
  }

  // A preview needs something to apply: a format, a font size, or a clear/revert.
  // A bare target ("format the table of contents like APA") is a question for the AI.
  if (!hasFormats && !hasFontSize && !intent.normalize) {
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
    align_left: 'Align Left',
    align_center: 'Align Center',
    align_right: 'Align Right',
    align_justify: 'Justify',
  }

  const primary = intent.formats[0]
  const reasonParts: string[] = []

  if (intent.normalize) {
    if (lastPreview?.formats && lastPreview.formats.length > 0) {
      reasonParts.push(
        `Reverting your previous change (${lastPreview.formats.map((f) => labels[f] ?? f).join(', ')}).`
      )
    } else {
      reasonParts.push('Detected a request to clear existing formatting.')
    }
  }
  if (hasFontSize) {
    reasonParts.push(`Font size ${intent.fontSize}pt requested.`)
  }
  if (intent.target && intent.targetMode === 'literal') {
    reasonParts.push(`Only the exact words "${intent.target}", wherever they appear.`)
  } else if (intent.target && intent.targetMode === 'title') {
    reasonParts.push('The document title.')
  } else if (intent.target) {
    reasonParts.push(`The whole "${intent.target.toUpperCase()}" section: its heading and everything under it.`)
  } else if (intent.normalize && lastPreview?.scope === 'all') {
    reasonParts.push('Applies to the whole document (matching your last change).')
  } else if (intent.targetCategory === 'headings') {
    reasonParts.push('Applies to all headings.')
  } else if (intent.targetCategory === 'chapters') {
    reasonParts.push('Applies to every chapter heading.')
  } else if (intent.targetCategory === 'paragraphs') {
    reasonParts.push('Applies to all paragraphs.')
  } else if (intent.scope === 'all') {
    reasonParts.push('Applies to the whole document.')
  }

  // Revert changes follow the previous change's scope/target unless the user
  // named a different target in this message.
  const resolvedScope: 'selection' | 'all' =
    intent.target !== null
      ? 'all'
      : intent.normalize && lastPreview?.scope
        ? lastPreview.scope
        : intent.scope
  const resolvedTarget = intent.target ?? (intent.normalize ? (lastPreview?.target ?? null) : null)
  const resolvedCategory = intent.normalize
    ? (lastPreview?.targetCategory ?? intent.targetCategory)
    : intent.targetCategory
  // A new clear request ("remove bold") must carry the mark it names; only
  // fall back to the previous preview when the message names no mark at all.
  const revertFormats = intent.normalize
    ? (intent.formats.length > 0 ? intent.formats : (lastPreview?.formats ?? []))
    : intent.formats
  const fontSize = intent.fontSize ?? (intent.normalize && lastPreview ? (lastPreview.fontSize ?? null) : null)

  return {
    format: intent.normalize
      ? (revertFormats[0] ?? 'body_text')
      : (primary ?? 'body_text'),
    label: intent.normalize
      ? 'Clear formatting'
      : primary ? (labels[primary] ?? primary) : 'Font size',
    confidence: intent.confidence,
    reason: reasonParts.length > 0 ? reasonParts.join(' ') : 'Detected a likely formatting request.',
    formats: revertFormats,
    scope: resolvedScope,
    fontSize,
    target: resolvedTarget,
    targetMode: intent.target ? intent.targetMode : (intent.normalize ? (lastPreview?.targetMode ?? null) : null),
    targetCategory: resolvedCategory,
    normalize: intent.normalize,
    shortCircuitReply: null,
  }
}

/** Human label for a single preview context (used by confirmation re-display). */
function labelForFormat(preview: AIChatPreviewContext): string {
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
    align_left: 'Align Left',
    align_center: 'Align Center',
    align_right: 'Align Right',
    align_justify: 'Justify',
    body_text: 'Text',
  }
  const fmt = preview.formats?.[0] ?? preview.format
  return fmt ? (labels[fmt] ?? fmt) : 'Formatting'
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

    const preview = detectFormattingPreview(message, body.lastPreview)

    // A named section that is not in the document gets an honest answer instead
    // of a preview the editor cannot apply.
    if (
      preview?.target &&
      !preview.shortCircuitReply &&
      !documentHasTarget(body.documentContent ?? '', preview.target, preview.targetMode ?? null)
    ) {
      const sections = listOutlineSections(body.documentContent ?? '').slice(0, 8)
      const hint = sections.length > 0 ? ` The sections I can see are: ${sections.join(', ')}.` : ''
      const providerSummary = getProviderSummary()
      res.status(200).json({
        reply: `I couldn’t find “${preview.target}” in this document.${hint}`,
        provider: providerSummary.provider,
        model: providerSummary.model,
        mode: 'chat',
        preview: null,
      })
      return
    }

    // Formatting requests get a deterministic reply built from the preview the
    // editor will show, so the words can never contradict the Apply button.
    // Only open questions and writing help go to the AI model.
    let reply: string
    let answeredBy: AIProviderSummary | null = null
    let sources: Array<{ title: string }> = []
    if (preview?.shortCircuitReply) {
      reply = preview.shortCircuitReply
    } else if (preview) {
      reply = buildFormattingReply(
        {
          formats: preview.formats ?? [],
          fontSize: preview.fontSize ?? null,
          normalize: preview.normalize ?? false,
          scope: preview.scope ?? 'selection',
          target: preview.target ?? null,
          targetMode: preview.targetMode ?? null,
          targetCategory: preview.targetCategory ?? null,
        },
        message
      )
    } else {
      // Ground the answer in the saved document: the parts that match the question,
      // not just the excerpt the browser sent. Falls back to that excerpt on any failure.
      let retrieved: DocumentSection[] = []
      let allTitles: string[] | undefined
      if (body.documentId) {
        try {
          const doc = await getDocumentForUser(body.documentId, userId, req.user?.email)
          const sections = splitIntoSections(doc.content ?? '')
          retrieved = retrieveSections(sections, message)
          allTitles = sections.map((section) => section.title).filter((title) => title !== 'Opening of the document')
        } catch {
          retrieved = []
        }
      }
      sources = retrieved.map((section) => ({ title: section.title }))

      // chatWithMeta reports which profile actually answered after any failover.
      const response = await aiClient.chatWithMeta(
        [
          ...buildHistoryMessages(body.history),
          { role: 'user', content: message },
        ],
        buildAIChatSystemPrompt({
          documentContext: buildChatContext({ ...body, retrievedSections: retrieved, allSectionTitles: allTitles }),
          rejectedFormattingPreviews: body.rejectedFormattingPreviews ?? [],
        })
      )
      reply = response.text
      answeredBy = { provider: response.provider, model: response.model }
    }

    const providerSummary = answeredBy ?? getProviderSummary()

    res.status(200).json({
      reply,
      provider: providerSummary.provider,
      model: providerSummary.model,
      mode: preview ? 'preview' : 'chat',
      sources,
      preview: preview
        ? {
            format: preview.format,
            label: preview.label,
            confidence: preview.confidence,
            reason: preview.reason,
            formats: preview.formats,
            scope: preview.scope,
            fontSize: preview.fontSize,
            target: preview.target,
            targetMode: preview.targetMode ?? null,
            targetCategory: preview.targetCategory,
            normalize: preview.normalize,
          }
        : null,
    })
  } catch (error) {
    const status =
      typeof (error as ErrorWithStatus | undefined)?.status === 'number'
        ? (error as ErrorWithStatus).status as number
        : 500
    // Provider outages and timeouts get a plain message instead of the raw abort text.
    const message =
      status >= 500
        ? 'The assistant is taking too long right now. Try again in a moment.'
        : error instanceof Error
          ? error.message
          : 'AI chat request failed'

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

/** How often this user accepts suggestions, overall, by kind and week by week. */
export async function getLearningStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.status(200).json(summarizeLearning(await listFeedbackRows(userId)))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load learning stats'
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

