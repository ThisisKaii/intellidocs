import { Request, Response } from 'express'
import { aiClient } from '../ai/aiClient'
import { buildAIChatSystemPrompt } from '../ai/prompts/systemPrompts'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { buildChatContext } from '../skills/buildChatContext'
import { hasStyleChange, looksLikeQuestion, parseFormattingIntent, describePosition, describeTargetCategory, type BlockCategory, type StyleChange, type TargetCategory, type TargetMode } from '../skills/parseFormattingIntent'
import { buildFormattingReply, buildMultiFormattingReply, summarizeFormattingChange } from '../skills/buildFormattingReply'
import { splitFormattingOperations } from '../skills/splitFormattingOperations'
import { documentHasTarget, listOutlineSections } from '../skills/documentSections'
import { retrieveSections, splitIntoSections, type DocumentSection } from '../skills/retrieveDocumentSections'
import { getDocumentForUser } from '../models/documentModel'
import { listFeedbackRows } from '../models/feedbackModel'
import { summarizeLearning } from '../skills/summarizeLearning'
import { resolveDocumentGenre } from '../utils/documentGenre'
import { isUsualFormattingRequest } from '../skills/buildLearnedFormattingPlan'
import { documentBody } from '../models/documentTabModel'
import { detectWritingTask, type WritingTask } from '../skills/detectWritingTask'
import { detectCaptionRequest } from '../skills/detectCaptionRequest'
import { PRESET_NAMES, automationCard, captionsCard } from '../skills/assistantCards'
import { detectAutomationRequest } from '../skills/detectAutomationRequest'
import { usualFormattingCard } from '../skills/usualFormattingCard'
import { runAssistantFallback } from '../mcp/assistantFallback'
import { looksLikeCommand, namesUnknownGroup } from '../skills/routeAssistantRequest'
import { recordRouteOutcome } from '../models/assistantRouteModel'
import { orchestrateSectionDraft } from '../skills/orchestrateSectionDraft'
import { groundLiteratureCitations } from '../skills/groundLiteratureCitations'
import { refineAcademicTone } from '../skills/refineAcademicTone'

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
  /** Text selected in the editor when the message was sent. */
  selectionText?: string
}

/** Compact snapshot of a previously shown formatting preview (from the client). */
interface AIChatPreviewContext {
  format?: string
  formats?: string[]
  scope?: 'selection' | 'all'
  fontSize?: number | null
  target?: string | null
  targetMode?: TargetMode | null
  normalize?: boolean
  targetCategory?: TargetCategoryName | null
  targetIndex?: number | null
  targetPage?: number | 'current' | null
  style?: StyleChange | null
  /** Every change of a multi-change preview, so "yes" can show them all again. */
  operations?: PreviewOperation[]
}

type TargetCategoryName = TargetCategory

/** One change of a multi-change preview, applied by the editor in order. */
interface PreviewOperation {
  formats: string[]
  fontSize: number | null
  normalize: boolean
  scope: 'selection' | 'all'
  target: string | null
  targetMode: TargetMode | null
  targetCategory: TargetCategoryName
  targetIndex: number | null
  targetPage: number | 'current' | null
  /** Line spacing, first-line indent, font family and letter case. */
  style: StyleChange
  /** The change in words, e.g. "Make every chapter heading bold and centered". */
  summary: string
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
  /** How the target is meant: literal words, a section's title line, a whole section, or the document title. */
  targetMode?: TargetMode | null
  /** Block category a bulk request targets: headings, paragraphs, chapter headings, or all. */
  targetCategory?: TargetCategoryName | null
  targetIndex?: number | null
  targetPage?: number | 'current' | null
  /** True when the change clears existing formatting (revert to normal). */
  normalize?: boolean
  /** Deterministic reply when no provider call is needed (confirmations/follow-ups). */
  shortCircuitReply?: string | null
  /** Several independent changes from one request; the fields above describe the first. */
  operations?: PreviewOperation[]
  /** Line spacing, first-line indent, font family and letter case. */
  style?: StyleChange | null
  /** For format `preset`: the academic preset to apply (e.g. "apa_7th"). */
  presetKey?: string | null
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
  lastPreview: AIChatPreviewContext | null | undefined,
  knownTitles: readonly string[] = []
): FormattingPreview | null {
  const intent = parseFormattingIntent(message, { knownTitles })
  const normalized = message.toLowerCase().trim()
  // Style changes (spacing, indent, font, case) count as formats for every check below.
  const hasFormats = intent.formats.length > 0 || hasStyleChange(intent.style)
  const hasFontSize = intent.fontSize !== null

  // "Format in APA style": the preset itself, applied by the editor in one click
  // (page setup, fonts and heading styles), instead of a guessed heading change.
  if (intent.preset && PRESET_NAMES[intent.preset] && intent.formats.length === 0 && !hasStyleChange(intent.style) && !intent.fontSize) {
    const name = PRESET_NAMES[intent.preset]
    return {
      format: 'preset',
      label: `${name} preset`,
      confidence: 0.9,
      reason: `Applies the ${name} preset: its page setup, body text and heading styles.`,
      formats: [],
      scope: 'all',
      presetKey: intent.preset,
      shortCircuitReply: `I can format this document with the ${name} preset: its margins, body text and heading styles. Press Apply to switch to it, or Reject to keep the current setup.`,
    }
  }

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
      style: lastPreview.style ?? null,
      operations: Array.isArray(lastPreview.operations) && lastPreview.operations.length > 0 ? lastPreview.operations : undefined,
      shortCircuitReply: Array.isArray(lastPreview.operations) && lastPreview.operations.length > 1
        ? 'Got it — here are those changes again. Confirm or reject below, or tell me what to adjust.'
        : 'Got it — here is your formatting change again. Confirm or reject below, or tell me what to adjust.',
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

  // A clear request with no place of its own ("remove the bold") follows the
  // previous change's place; one that names a place ("make the bullet points
  // not bold") is about that place. Only a bare "go back to normal" also undoes
  // the previous change's font size.
  const namesOwnPlace = intent.target !== null || intent.targetCategory !== 'all' || intent.targetPage !== null
  const followsLast = intent.normalize && !namesOwnPlace && lastPreview !== null && lastPreview !== undefined
  const undoesLast = followsLast && intent.formats.length === 0

  if (intent.normalize) {
    if (undoesLast && lastPreview?.formats && lastPreview.formats.length > 0) {
      reasonParts.push(
        `Reverting your previous change (${lastPreview.formats.map((f) => labels[f] ?? f).join(', ')}).`
      )
    } else if (intent.formats.length > 0) {
      reasonParts.push(`Removing ${intent.formats.map((f) => (labels[f] ?? f).toLowerCase()).join(' and ')}.`)
    } else {
      reasonParts.push('Detected a request to clear existing formatting.')
    }
  }
  if (hasFontSize) {
    reasonParts.push(`Font size ${intent.fontSize}pt requested.`)
  }
  if (intent.style.fontSizeStep) {
    const step = intent.style.fontSizeStep
    reasonParts.push(`Each run of text gets ${Math.abs(step)}pt ${step > 0 ? 'larger' : 'smaller'} than it is now.`)
  }
  if (intent.targetIndex !== null || intent.targetPage !== null) {
    const where = describePosition({ category: intent.targetCategory as BlockCategory | 'all', index: intent.targetIndex, page: intent.targetPage, within: intent.target })
    reasonParts.push(`Applies to ${where}.`)
  } else if (intent.target && intent.targetMode === 'literal') {
    reasonParts.push(`Only the exact words "${intent.target}", wherever they appear.`)
  } else if (intent.target && intent.targetMode === 'title') {
    reasonParts.push('The document title.')
  } else if (intent.target && intent.targetMode === 'heading') {
    reasonParts.push(`The "${intent.target.toUpperCase()}" heading line only, not the text under it.`)
  } else if (intent.target) {
    reasonParts.push(`The whole "${intent.target.toUpperCase()}" section: its heading and everything under it.`)
  } else if (followsLast && lastPreview?.scope === 'all') {
    reasonParts.push('Applies to the whole document (matching your last change).')
  } else if (intent.targetCategory === 'questions') {
    reasonParts.push('Applies to the research questions (the lines ending in a question mark).')
  } else if (intent.targetCategory !== 'all') {
    reasonParts.push(`Applies to ${describeTargetCategory(intent.targetCategory)}.`)
  } else if (intent.scope === 'all') {
    reasonParts.push('Applies to the whole document.')
  }

  // Revert changes follow the previous change's scope/target unless the user
  // named a different target in this message.
  const resolvedScope: 'selection' | 'all' =
    intent.target !== null
      ? 'all'
      : followsLast && lastPreview?.scope
        ? lastPreview.scope
        : intent.scope
  const resolvedTarget = intent.target ?? (followsLast ? (lastPreview?.target ?? null) : null)
  const resolvedCategory = followsLast
    ? (lastPreview?.targetCategory ?? intent.targetCategory)
    : intent.targetCategory
  // A new clear request ("remove bold") must carry the mark it names; only
  // fall back to the previous preview when the message names no mark at all.
  const revertFormats = intent.normalize
    ? (intent.formats.length > 0 ? intent.formats : (lastPreview?.formats ?? []))
    : intent.formats
  const fontSize = intent.fontSize ?? (undoesLast ? (lastPreview?.fontSize ?? null) : null)

  return {
    format: intent.normalize
      ? (revertFormats[0] ?? 'body_text')
      : (primary ?? 'body_text'),
    label: intent.normalize
      ? 'Clear formatting'
      : primary
        ? (labels[primary] ?? primary)
        : hasStyleChange({ ...intent.style, fontSizeStep: null }) ? 'Text style' : 'Font size',
    confidence: intent.confidence,
    reason: reasonParts.length > 0 ? reasonParts.join(' ') : 'Detected a likely formatting request.',
    formats: revertFormats,
    scope: resolvedScope,
    fontSize,
    target: resolvedTarget,
    targetMode: intent.target ? intent.targetMode : (followsLast ? (lastPreview?.targetMode ?? null) : null),
    targetCategory: resolvedCategory,
    targetIndex: followsLast ? (lastPreview?.targetIndex ?? null) : intent.targetIndex,
    targetPage: followsLast ? (lastPreview?.targetPage ?? null) : intent.targetPage,
    normalize: intent.normalize,
    style: intent.normalize ? null : intent.style,
    shortCircuitReply: null,
  }
}

/**
 * A request holding several independent changes ("center the chapter heading,
 * make the section headings Heading 2 and left-align the paragraphs") becomes
 * one preview carrying every change. Returns null when the message is a single
 * change, so the one-change flow above handles it unchanged.
 */
function detectMultiFormattingPreview(
  message: string,
  documentContent: string,
  knownTitles: readonly string[]
): { preview: FormattingPreview | null; reply: string } | null {
  const { operations, unresolved } = splitFormattingOperations(message, { knownTitles })
  if (operations.length === 0 || (operations.length === 1 && unresolved.length === 0)) return null

  const found = operations.filter((operation) => !operation.target || documentHasTarget(documentContent, operation.target, operation.targetMode))
  const missing = operations.filter((operation) => !found.includes(operation)).map((operation) => operation.target ?? '')
  const previewOperations: PreviewOperation[] = found.map((operation) => {
    const change = {
      formats: operation.formats,
      fontSize: operation.fontSize,
      normalize: operation.normalize,
      scope: operation.scope,
      target: operation.target,
      targetMode: operation.targetMode,
      targetCategory: operation.targetCategory,
      targetIndex: operation.targetIndex,
      targetPage: operation.targetPage,
      style: operation.style,
    }
    return { ...change, summary: summarizeFormattingChange(change) }
  })
  const reply = buildMultiFormattingReply(previewOperations, missing, unresolved, message)
  const first = previewOperations[0]
  if (!first) return { preview: null, reply }

  return {
    reply,
    preview: {
      format: first.formats[0] ?? 'body_text',
      label: previewOperations.length === 1 ? 'Formatting change' : `${previewOperations.length} formatting changes`,
      confidence: 0.9,
      reason: previewOperations.length === 1 ? first.summary : 'Every change below is applied together and can be undone in one step.',
      formats: first.formats,
      scope: first.scope,
      fontSize: first.fontSize,
      target: first.target,
      targetMode: first.targetMode,
      targetCategory: first.targetCategory,
      targetIndex: first.targetIndex,
      targetPage: first.targetPage,
      normalize: first.normalize,
      style: first.style,
      shortCircuitReply: reply,
      operations: previewOperations,
    },
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

/** Chat response for a Batch E writing-assist request: a deterministic reply plus the card's payload. */
async function runWritingTask(
  task: WritingTask,
  body: AIChatBody,
  userId: string,
  email: string | undefined
): Promise<Record<string, unknown>> {
  const providerSummary = getProviderSummary()
  const chat = (reply: string): Record<string, unknown> => ({ reply, provider: providerSummary.provider, model: providerSummary.model, mode: 'chat', preview: null })

  if (task.kind === 'decline') {
    return chat(
      'I can’t write sections or essays from a topic: IntelliDocs works with your own writing. I can organise your notes into a formal section ("Organise my notes for the Introduction: …"), find real published sources for a claim ("Find citations for …"), or polish your own sentences (select a paragraph and ask me to refine it).'
    )
  }

  if (task.kind === 'structure') {
    let genre: string | undefined
    if (body.documentId) {
      try {
        genre = resolveDocumentGenre(await getDocumentForUser(body.documentId, userId, email))
      } catch {
        genre = undefined
      }
    }
    const result = await orchestrateSectionDraft({ sectionTitle: task.sectionTitle, userNotes: task.notes, genre })
    if (result.declined !== undefined) return chat(result.declined)
    const structured = { sectionTitle: result.sectionTitle, outline: result.outline, paragraphs: result.paragraphs, warnings: result.warnings }
    const points = structured.outline.reduce((total, move) => total + move.notes.length, 0)
    return {
      ...chat(
        `I organised your ${points} points into ${structured.paragraphs.length} paragraph${structured.paragraphs.length === 1 ? '' : 's'} for “${structured.sectionTitle}”. Check the wording below, then insert it at your cursor.`
      ),
      mode: 'structure',
      structured,
    }
  }

  if (task.kind === 'citations') {
    if (!task.query) return chat('Tell me the claim or topic to find sources for, or select the sentence in your document and ask again.')
    const papers = await groundLiteratureCitations({ query: task.query, limit: task.limit })
    if (papers.length === 0) {
      return chat('I couldn’t find published papers matching that in Crossref or Semantic Scholar. Try fewer, more specific keywords.')
    }
    return {
      ...chat(
        `I found ${papers.length} published paper${papers.length === 1 ? '' : 's'} in Crossref and Semantic Scholar. Read each abstract to check it really supports your claim, then tick the ones to cite.`
      ),
      mode: 'citations',
      papers,
      citationQuery: task.query,
    }
  }

  if (!task.text) return chat('Select the paragraph you want refined in your document, then ask again.')
  const refinement = await refineAcademicTone({ text: task.text, focus: task.focus, contextText: body.documentContent ?? '' })
  if (refinement.edits.length === 0 && refinement.notices.length === 0) {
    return chat('That passage already reads as formal academic writing; I have no changes to suggest.')
  }
  const count = refinement.edits.length
  return {
    ...chat(
      count > 0
        ? `I have ${count} suggested revision${count === 1 ? '' : 's'}. Apply the ones you agree with; nothing changes until you do.`
        : 'I have no wording changes, but there is something to check below.'
    ),
    mode: 'refine',
    refinement: { ...refinement, sourceText: task.text },
  }
}

/** The 429 for a user over their AI request quota. */
function sendQuotaExceeded(res: Response, quota: { limit: number; remaining: number; resetInSeconds: number }): void {
  res.status(429).json({
    error: 'AI request quota exceeded',
    quota: { limit: quota.limit, remaining: quota.remaining, resetInSeconds: quota.resetInSeconds },
  })
}

/** Whether the user applied or rejected a change the AI chose, so the route is kept or asked afresh. */
export async function logRouteFeedback(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const { routeId, applied } = req.body as { routeId: string; applied: boolean }
  await recordRouteOutcome(userId, routeId, applied)
  res.status(204).end()
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

    // Only requests that reach an AI model use quota: the fixed rules (formatting, presets,
    // captions, learned habits) answer for free.
    const chargeQuota = async (): Promise<boolean> => {
      const quota = await consumeAIQuota(userId, 'chat')
      if (quota.allowed) return true
      sendQuotaExceeded(res, quota)
      return false
    }

    // "Auto caption": the editor finds what has no caption and shows it as a preview card.
    const captionRequest = detectCaptionRequest(message)
    if (captionRequest) {
      const providerSummary = getProviderSummary()
      res.status(200).json({ ...captionsCard(captionRequest.kinds), provider: providerSummary.provider, model: providerSummary.model })
      return
    }

    // Automations named plainly ("fix the figure numbering"): their card, without an AI call.
    const automation = detectAutomationRequest(message)
    if (automation) {
      const providerSummary = getProviderSummary()
      res.status(200).json({ ...automationCard(automation), provider: providerSummary.provider, model: providerSummary.model })
      return
    }

    // Organise notes, find citations, refine tone: each agent's result is a
    // preview card in the chat; nothing reaches the document without a click.
    const writingTask = detectWritingTask(message, body.selectionText ?? '')
    if (writingTask) {
      if (!(await chargeQuota())) return
      res.status(200).json(await runWritingTask(writingTask, body, userId, req.user?.email))
      return
    }

    // "Apply my usual formatting": the habits learned in this document's genre only, as a
    // preview the editor matches against its blocks and applies in one click.
    if (isUsualFormattingRequest(message)) {
      const providerSummary = getProviderSummary()
      const card = await usualFormattingCard(userId, req.user?.email, body.documentId)
      res.status(200).json({ ...card, provider: providerSummary.provider, model: providerSummary.model })
      return
    }

    // Section titles the open document really has, so "Format Statement of the
    // Problem as Heading 2" finds its target without quotes.
    const knownTitles = listOutlineSections(body.documentContent ?? '')
    // A question about the document is answered, never turned into a preview,
    // even when it mentions formatting words ("What should be bold in chapter 1?").
    const asksQuestion = looksLikeQuestion(message)

    // Several changes in one request: list them all, and say what was left out.
    const multi = asksQuestion ? null : detectMultiFormattingPreview(message, body.documentContent ?? '', knownTitles)
    if (multi && !multi.preview) {
      const providerSummary = getProviderSummary()
      res.status(200).json({ reply: multi.reply, provider: providerSummary.provider, model: providerSummary.model, mode: 'chat', preview: null })
      return
    }

    const detected = asksQuestion ? null : (multi?.preview ?? detectFormattingPreview(message, body.lastPreview, knownTitles))
    // "Center every pic": a group the fixed rules do not know must not quietly become the
    // selection. Leave it to the AI fallback, which can ask or pick the right tool.
    const preview = detected && !multi && detected.scope === 'selection' && !detected.target && namesUnknownGroup(message) ? null : detected

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

    // Nothing the fixed rules recognise and not a question: the AI picks one of the assistant's
    // tools (or asks which one was meant). Its pick is still only a card the user applies.
    if (!preview && !asksQuestion && !multi && looksLikeCommand(message)) {
      const fallback = await runAssistantFallback({
        userId,
        email: req.user?.email,
        message,
        documentId: body.documentId,
        documentContent: body.documentContent ?? '',
        sectionTitles: knownTitles,
        rejected: (body.rejectedFormattingPreviews ?? []).map((rejected) => rejected.format),
      })
      const providerSummary = getProviderSummary()
      const meta = { provider: providerSummary.provider, model: providerSummary.model }
      if (fallback.kind === 'quota') {
        sendQuotaExceeded(res, fallback.quota)
        return
      }
      if (fallback.kind === 'card') {
        res.status(200).json({ ...fallback.card, ...meta, routedBy: 'ai', routeId: fallback.routeId })
        return
      }
      if (fallback.kind === 'clarify') {
        res.status(200).json({ reply: fallback.question, ...meta, mode: 'clarify', preview: null, routedBy: 'ai', routeId: fallback.routeId, clarify: { question: fallback.question, options: fallback.options } })
        return
      }
      if (fallback.kind === 'answer') {
        res.status(200).json({ reply: fallback.reply, ...meta, mode: 'chat', preview: null })
        return
      }
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
          targetIndex: preview.targetIndex ?? null,
          targetPage: preview.targetPage ?? null,
          style: preview.style ?? null,
        },
        message
      )
    } else {
      if (!(await chargeQuota())) return
      // Ground the answer in the saved document: the parts that match the question,
      // not just the excerpt the browser sent. Falls back to that excerpt on any failure.
      let retrieved: DocumentSection[] = []
      let allTitles: string[] | undefined
      if (body.documentId) {
        try {
          const doc = await getDocumentForUser(body.documentId, userId, req.user?.email)
          const sections = splitIntoSections(await documentBody(doc))
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
            targetIndex: preview.targetIndex ?? null,
            targetPage: preview.targetPage ?? null,
            normalize: preview.normalize,
            operations: preview.operations,
            style: preview.style ?? null,
            presetKey: preview.presetKey ?? null,
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
      blockText?: string
      keptFormat?: string
    }

    const { processAIFeedback } = await import('../skills/feedbackLoop')

    await processAIFeedback({
      userId,
      documentId: body.documentId,
      predictionType: body.predictionType,
      predictedFormat: body.predictedFormat,
      confidence: body.confidence,
      accepted: body.accepted,
      blockText: body.blockText,
      keptFormat: body.keptFormat,
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

    // Aggregate the user's behavior, then fine-tune on their labeled blocks (as the automatic runs do).
    const { runPersonalization } = await import('../skills/personalizationTrigger')
    const result = await runPersonalization(userId)

    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fine-tune trigger failed'
    res.status(500).json({ error: message })
  }
}

