import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'
import { undoDepth } from '@tiptap/pm/history'
import { api, type AIChatFormattingOperation, type AIChatPreviewMeta, type AIChatStyleChange, type AIChatTargetCategory, type AIChatTargetMode, type LearnedFormattingRule, type RejectedFormattingPreview } from '@/services/api'
import { applyFormatsToRanges, applyFormatsToSelection, applyStyle, findCategoryRanges, findLearnedBlockRanges, hasStyle, preferWholeBlocks, resolveTargetRanges, type BlockCategory } from './chatFormatting'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  command_applied?: string | null
  preview_format?: string | null
  preview_formats?: string[] | null
  preview_scope?: 'selection' | 'all' | null
  preview_target?: string | null
  preview_target_mode?: AIChatTargetMode | null
  preview_target_category?: AIChatTargetCategory | null
  preview_normalize?: boolean | null
  /** Every change of a multi-change preview, applied together in order. */
  preview_operations?: AIChatFormattingOperation[] | null
  /** Line spacing, first-line indent, font family and letter case of a one-change preview. */
  preview_style?: AIChatStyleChange | null
  /** For a preset preview ("Format in APA style"): the preset key Apply switches to. */
  preview_preset_key?: string | null
  preview_font_size?: number | null
  preview_reason?: string | null
  preview_status?: 'pending' | 'applied' | 'rejected' | null
  /** Document sections an AI answer was based on (undefined for rule-based replies). */
  sources?: Array<{ title: string }>
  /** "Apply my usual formatting": the learned habits that match blocks of this document. */
  preview_learned?: LearnedPlace[] | null
}

/** A learned habit and how many blocks of the open document it matches. */
interface LearnedPlace extends LearnedFormattingRule {
  places: number
}

/** Most chat messages kept per document for the session (about 10 turns). */
const STORED_MESSAGES = 20

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Hello! I’m your IntelliDocs AI assistant. I can help you think through formatting, wording, and document edits. I won’t auto-apply changes yet, but I can guide you based on your current document.',
}

/** Session storage key of one document's chat. */
const chatStorageKey = (documentId: string): string => `intellidocs:chat:${documentId}`

/**
 * This document's chat from earlier in the browser session, so a reload or a reopened panel keeps
 * the conversation (and follow-ups like "now make them bold" keep their context). A pending preview
 * comes back expired: the document may have changed since it was made.
 */
function readStoredChat(documentId: string | undefined): ChatMessage[] {
  if (!documentId) return [GREETING]
  try {
    const raw = sessionStorage.getItem(chatStorageKey(documentId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return [GREETING]
    const messages = parsed.filter(
      (entry: unknown): entry is ChatMessage =>
        typeof entry === 'object' && entry !== null &&
        ((entry as ChatMessage).role === 'user' || (entry as ChatMessage).role === 'assistant') &&
        typeof (entry as ChatMessage).content === 'string'
    )
    return messages.length > 0
      ? messages.map((message) => (message.preview_status === 'pending' ? { ...message, preview_status: null } : message))
      : [GREETING]
  } catch {
    return [GREETING]
  }
}

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatbotProps {
  editor: Editor | null
  documentId: string | undefined
  documentTitle?: string
  documentContent: string
  onFormatApplied?: (format: string) => void
  onFeedbackLogged?: () => void
  onFocusEditor?: () => void
  /** Render embedded inside a docked panel (no floating button, panel fills parent). */
  docked?: boolean
  /** Switch the document to an academic preset (page setup, body and heading styles). */
  onApplyPreset?: (presetKey: string) => void
}

/** Text-align values for the align_* formats, keyed by format name. */
const ALIGNMENTS: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
  align_left: 'left',
  align_center: 'center',
  align_right: 'right',
  align_justify: 'justify',
}

/** Return the first text alignment requested in a format list, if any. */
function alignmentOf(formats: string[]): 'left' | 'center' | 'right' | 'justify' | null {
  for (const format of formats) {
    const value = ALIGNMENTS[format]
    if (value) return value
  }
  return null
}

/** One formatting change as the editor applies it (a whole preview, or one of its operations). */
interface PlannedChange {
  formats: string[]
  scope: 'selection' | 'all'
  fontSize?: number
  target: string | null
  targetMode: AIChatTargetMode | null
  targetCategory: AIChatTargetCategory | null
  normalize: boolean
  style: AIChatStyleChange | null
}

/** Words for the style part of a change: "double spacing", "Times New Roman", "0.5in first-line indent". */
function styleLabels(style: AIChatStyleChange | null): string[] {
  if (!style) return []
  const labels: string[] = []
  if (style.fontFamily) labels.push(style.fontFamily)
  if (style.lineSpacing !== null) labels.push(style.lineSpacing === 2 ? 'double spacing' : style.lineSpacing === 1 ? 'single spacing' : `${style.lineSpacing} line spacing`)
  if (style.firstLineIndentIn !== null) labels.push(`${style.firstLineIndentIn}in first-line indent`)
  if (style.textCase === 'upper') labels.push('ALL CAPITALS')
  if (style.textCase === 'title') labels.push('Title Case')
  return labels
}

/** How each block category reads in an "applied" note. */
const CATEGORY_NOTES: Record<BlockCategory, string> = {
  headings: 'all headings',
  sections: 'every section heading',
  chapters: 'every chapter heading',
  paragraphs: 'all body paragraphs',
  questions: 'the research questions',
}

/** Floating AI chatbot for natural language document help. */
export default function AIChatbot({
  editor,
  documentId,
  documentTitle,
  documentContent,
  onFormatApplied,
  onFeedbackLogged,
  onFocusEditor,
  docked = false,
  onApplyPreset,
}: AIChatbotProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(docked)
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredChat(documentId))
  const [input, setInput] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [rejectedPreviews, setRejectedPreviews] = useState<RejectedFormattingPreview[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastPreviewRef = useRef<AIChatPreviewMeta | null>(null)
  /** Changes applied from this chat, newest last, so "undo that" can really revert them. */
  const appliedStackRef = useRef<Array<{ depthBefore: number; label: string }>>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Keep the last turns of this document's chat for the browser session. Runs before the switch
  // below, so on a document change the old messages are never written under the new document.
  const storedForRef = useRef(documentId)
  useEffect(() => {
    if (!documentId || storedForRef.current !== documentId) return
    try {
      sessionStorage.setItem(chatStorageKey(documentId), JSON.stringify(messages.slice(-STORED_MESSAGES)))
    } catch {
      // Storage full or blocked: the chat still works on this page.
    }
  }, [documentId, messages])

  // Another document opened in the same panel: show that document's chat.
  useEffect(() => {
    if (storedForRef.current === documentId) return
    storedForRef.current = documentId
    setMessages(readStoredChat(documentId))
    lastPreviewRef.current = null
    appliedStackRef.current = []
  }, [documentId])

  /** Format a machine-readable format key into a user-facing label. */
  function formatPreviewLabel(format: string): string {
    const labels: Record<string, string> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      heading1: 'Chapter heading',
      heading2: 'Section heading',
      heading3: 'Subsection heading',
      h1: 'Chapter heading',
      h2: 'Section heading',
      h3: 'Subsection heading',
      blockquote: 'Blockquote',
      unordered_list: 'Bullet List',
      ordered_list: 'Numbered List',
      ul: 'Bullet List',
      ol: 'Numbered List',
      align_left: 'Align Left',
      align_center: 'Align Center',
      align_right: 'Align Right',
      align_justify: 'Justify',
    }

    return labels[format] ?? format
  }

  /** Return true when a format was already rejected in this chat session. */
  function hasRejectedPreview(format: string): boolean {
    return rejectedPreviews.some((preview) => preview.format === format)
  }

  /**
   * Single-format commands for the selection (or the block the cursor is in).
   * They only add formatting: asking for bold on bold text keeps it bold, and
   * a heading request keeps each block's own alignment and spacing.
   */
  const SELECTION_FORMATS = [
    'bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'blockquote',
    'unordered_list', 'ordered_list', 'align_left', 'align_center', 'align_right', 'align_justify',
  ]
  const SELECTION_COMMANDS: Record<string, ((ed: Editor) => void) | undefined> = Object.fromEntries(
    SELECTION_FORMATS.map((format) => [format, (ed: Editor) => applyFormatsToSelection(ed, [format])])
  )

  /** Describe a preview as one readable string, e.g. "Bold + Italic + font size 20pt". */
  function describePreview(msg: ChatMessage): string {
    if (msg.preview_learned) {
      const places = msg.preview_learned.reduce((sum, rule) => sum + rule.places, 0)
      return `Your usual formatting — ${places} place${places === 1 ? '' : 's'}`
    }
    if (msg.preview_operations && msg.preview_operations.length > 1) {
      return `${msg.preview_operations.length} changes in one go`
    }
    if (msg.preview_preset_key) return msg.preview_reason?.replace(/^Applies the (.+?) preset.*$/, '$1 preset') ?? 'Academic preset'
    const parts: string[] = []
    if (msg.preview_normalize) parts.push('Clear formatting')
    const formats =
      msg.preview_formats && msg.preview_formats.length > 0
        ? msg.preview_formats
        : msg.preview_format && msg.preview_format !== 'body_text'
          ? [msg.preview_format]
          : []
    for (const format of formats) {
      if (!msg.preview_normalize) parts.push(formatPreviewLabel(format))
    }
    if (msg.preview_font_size) parts.push(`font size ${msg.preview_font_size}pt`)
    parts.push(...styleLabels(msg.preview_style ?? null))
    if (parts.length === 0) parts.push(describePreviewText(msg))
    return parts.join(' + ')
  }

  /** Fallback label when a preview has no concrete formats to describe. */
  function describePreviewText(msg: ChatMessage): string {
    if (msg.preview_formats && msg.preview_formats.length > 0) {
      return msg.preview_formats.map(formatPreviewLabel).join(' + ')
    }
    return msg.preview_format ? formatPreviewLabel(msg.preview_format) : 'Text'
  }

  /** Human-readable scope suffix for the preview, honoring chapter targets. */
  function previewScopeLabel(msg: ChatMessage): string {
    if (msg.preview_scope === 'all') {
      if (msg.preview_target && msg.preview_target_mode === 'literal') return `— the words “${msg.preview_target}”`
      if (msg.preview_target && msg.preview_target_mode === 'title') return '— the document title'
      if (msg.preview_target && msg.preview_target_mode === 'heading') return `— the “${msg.preview_target}” heading line`
      if (msg.preview_target) {
        const words = msg.preview_target.split(' ')
        const capitalized = words
          .map((word) => (word === 'chapter' || word === 'section' ? word : word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
          .join(' ')
        return `— ${capitalized}`
      }
      if (msg.preview_target_category === 'headings') return '— all headings'
      if (msg.preview_target_category === 'chapters') return '— every chapter heading'
      if (msg.preview_target_category === 'sections') return '— every section heading'
      if (msg.preview_target_category === 'questions') return '— the research questions'
      if (msg.preview_target_category === 'paragraphs') return '— all body paragraphs'
      return '— entire document'
    }
    return ''
  }

  /** Parse key=value arguments for MCP tool calls. */
  function parseMcpArgs(raw: string): Record<string, string> {
    const args: Record<string, string> = {}
    const parts = raw.split(/\s+/).filter(Boolean)

    for (const part of parts) {
      const [key, ...rest] = part.split('=')
      if (!key || rest.length === 0) continue
      args[key] = rest.join('=')
    }

    return args
  }

  /** Parse /mcp tool calls from chat input. */
  function parseMcpCommand(
    input: string
  ): { tool: string; args: Record<string, string> } | null {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/mcp ')) return null

    const body = trimmed.slice(5).trim()
    if (!body) return null

    const [tool, ...rest] = body.split(/\s+/)
    const args = parseMcpArgs(rest.join(' '))

    return { tool, args }
  }

  /** Apply set-semantics marks + font size (and line spacing, indent, font, case) across the whole document. */
  function applyBulkFormats(formats: string[], fontSize?: number, style?: AIChatStyleChange | null): void {
    if (!editor || editor.isDestroyed) return
    let chain = editor.chain().focus().selectAll()
    for (const format of formats) {
      if (format === 'bold') chain = chain.setMark('bold')
      else if (format === 'italic') chain = chain.setMark('italic')
      else if (format === 'underline') chain = chain.setMark('underline')
    }
    if (fontSize) chain = chain.setMark('textStyle', { fontSize: `${fontSize}pt` })
    chain.run()
    // Alignment is a block attribute rather than a mark, so it needs its own
    // pass over the same range.
    const align = alignmentOf(formats)
    if (align) editor.chain().focus().selectAll().setTextAlign(align).run()
    if (hasStyle(style)) applyStyle(editor, { from: 0, to: editor.state.doc.content.size }, style)
    // Collapse the selection so subsequent typing isn't auto-formatted.
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }

  /**
   * Apply formats to every block of a category (all headings, section headings,
   * chapter headings or paragraphs), leaving the rest of the document untouched.
   */
  function applyFormatsToBlocks(
    category: BlockCategory,
    formats: string[],
    fontSize?: number,
    normalize = false,
    style?: AIChatStyleChange | null
  ): void {
    if (!editor || editor.isDestroyed) return
    applyFormatsToRanges(editor, findCategoryRanges(editor.state.doc, category), formats, fontSize, normalize, style)
    // Collapse the selection so subsequent typing isn't auto-formatted.
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }

  /**
   * Format what a target names without any manual highlighting: the exact
   * words for a quoted phrase, the whole section (title block plus everything
   * under it) for a section or chapter name, or the document title. Returns how
   * many places changed (0 when the target is not in the document).
   */
  function applyFormatsToTarget(
    target: string,
    mode: ChatMessage['preview_target_mode'],
    formats: string[],
    fontSize?: number,
    normalize = false,
    style?: AIChatStyleChange | null
  ): number {
    if (!editor || editor.isDestroyed) return 0
    const found = resolveTargetRanges(editor.state.doc, target, mode ?? 'section')
    // A heading request on quoted words means the line that IS those words,
    // not every sentence that mentions them.
    const ranges = mode === 'literal' && formats.some((format) => /^(?:heading[123]|h[123])$/.test(format))
      ? preferWholeBlocks(editor.state.doc, found)
      : found
    if (ranges.length === 0) return 0
    applyFormatsToRanges(editor, ranges, formats, fontSize, normalize, style)
    // Put the caret at the start of the first match and scroll it into view so
    // the change is visible without the user hunting for it.
    const first = Math.min(...ranges.map((range) => range.from))
    editor.commands.setTextSelection(first)
    editor.commands.scrollIntoView()
    return ranges.length
  }

  /** Clear existing marks in the given scope, optionally setting a font size. */
  function applyNormalize(scope: 'selection' | 'all', fontSize?: number): void {
    if (!editor || editor.isDestroyed) return
    // With no text selected, clear the whole current block so the action is visible.
    if (scope === 'selection' && editor.state.selection.empty) {
      editor.chain().focus().selectParentNode().run()
    }
    const chain =
      scope === 'all'
        ? editor.chain().focus().selectAll().unsetAllMarks()
        : editor.chain().focus().unsetAllMarks()
    const exec = fontSize ? chain.setMark('textStyle', { fontSize: `${fontSize}pt` }) : chain
    exec.run()
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }

  /** The words for what one change does: "Bold + Align Center + size 14pt". */
  function describeChangeParts(change: PlannedChange, fallbackFormat: string): string[] {
    const parts: string[] = []
    if (change.normalize) parts.push('Clear formatting')
    for (const format of change.formats) parts.push(formatPreviewLabel(format))
    if (change.fontSize) parts.push(`size ${change.fontSize}pt`)
    parts.push(...styleLabels(change.style))
    if (parts.length === 0) parts.push(formatPreviewLabel(fallbackFormat))
    return parts
  }

  /** Apply one change of a preview to the editor and describe what happened. */
  function applyChange(change: PlannedChange, fallbackFormat: string): string {
    if (!editor || editor.isDestroyed) return ''
    const { formats, scope, fontSize, target, targetCategory, normalize, style } = change
    const scopeNote =
      scope === 'all' && targetCategory && targetCategory !== 'all' ? ` (${CATEGORY_NOTES[targetCategory]})` : ''

    let targetWarning = ''
    if (target && scope === 'all') {
      const places = applyFormatsToTarget(target, change.targetMode, formats, fontSize, normalize, style)
      if (places === 0) targetWarning = ` (could not find "${target}" in the document)`
      else if (change.targetMode === 'literal' && places > 1) targetWarning = ` (${places} places)`
    } else if (scope === 'all' && targetCategory && targetCategory !== 'all') {
      applyFormatsToBlocks(targetCategory, formats, fontSize, normalize, style)
    } else if (normalize) {
      applyNormalize(scope, fontSize)
    } else if (scope === 'all') {
      applyBulkFormats(formats, fontSize, style)
    } else {
      onFocusEditor?.()
      // With nothing selected this formats the block the cursor is in, so the
      // change lands on something visible without highlighting first.
      applyFormatsToSelection(editor, formats, fontSize, style)
    }

    return `${describeChangeParts(change, fallbackFormat).join(' + ')}${target && scope === 'all' ? ` on “${target}”` : ''}${scopeNote}${targetWarning}`
  }

  /** Apply a confirmed formatting preview to the editor (selection or whole doc). */
  function handlePreviewApply(messageIndex: number, msg: ChatMessage): void {
    if (!editor) return
    if (msg.preview_learned) {
      applyLearnedPlaces(messageIndex, msg.preview_learned)
      return
    }
    // "Format in APA style": the editor switches the whole document to the preset.
    if (msg.preview_preset_key) {
      onApplyPreset?.(msg.preview_preset_key)
      setMessages((current) =>
        current.map((message, index) =>
          index === messageIndex ? { ...message, preview_status: 'applied', command_applied: describePreview(message) } : message
        )
      )
      return
    }

    const single: PlannedChange = {
      formats:
        msg.preview_formats && msg.preview_formats.length > 0
          ? msg.preview_formats
          : msg.preview_format && msg.preview_format !== 'body_text'
            ? [msg.preview_format]
            : [],
      scope: msg.preview_scope ?? 'selection',
      fontSize: msg.preview_font_size ? msg.preview_font_size : undefined,
      target: msg.preview_target ?? null,
      targetMode: msg.preview_target_mode ?? null,
      targetCategory: msg.preview_target_category ?? null,
      normalize: msg.preview_normalize ?? false,
      style: msg.preview_style ?? null,
    }
    const changes: PlannedChange[] =
      msg.preview_operations && msg.preview_operations.length > 0
        ? msg.preview_operations.map((operation) => ({
            formats: operation.formats,
            scope: operation.scope,
            fontSize: operation.fontSize ?? undefined,
            target: operation.target,
            targetMode: operation.targetMode,
            targetCategory: operation.targetCategory,
            normalize: operation.normalize,
            style: operation.style ?? null,
          }))
        : [single]

    // Every change of the request is applied here, one after another, and
    // recorded as one entry so "undo that" takes them all back together.
    const depthBefore = undoDepth(editor.state)
    const labels = changes.map((change) => applyChange(change, msg.preview_format ?? ''))
    const formats = changes.flatMap((change) => change.formats)

    onFormatApplied?.(changes.map((change) => describeChangeParts(change, msg.preview_format ?? '').join('+')).join('+'))

    if (documentId) {
      api.behavior
        .log({
          action: `chat_preview_accepted:${formats.join(',')}`,
          timestamp: new Date().toISOString(),
          documentId,
        })
        .catch((error) => console.error('Chat preview acceptance log failed', error))
    }

    api.ai
      .logFeedback({
        documentId: documentId || undefined,
        predictionType: 'chat_preview',
        predictedFormat: formats.join(','),
        accepted: true,
      })
      .catch((error) => console.error('Chat preview acceptance feedback log failed', error))

    onFeedbackLogged?.()

    const appliedLabel = labels.join('; ')
    // Remember how to take this change back (only when the document really changed).
    if (undoDepth(editor.state) > depthBefore) {
      appliedStackRef.current.push({ depthBefore, label: appliedLabel })
    }

    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              preview_status: 'applied',
              command_applied: appliedLabel,
            }
          : message
      )
    )
  }

  /** Apply every matched learned habit to its blocks, as one change "undo that" can take back. */
  function applyLearnedPlaces(messageIndex: number, rules: LearnedPlace[]): void {
    if (!editor || editor.isDestroyed) return
    const depthBefore = undoDepth(editor.state)
    let changed = 0
    for (const rule of rules) {
      const ranges = findLearnedBlockRanges(editor.state.doc, rule.key)
      if (ranges.length === 0) continue
      applyFormatsToRanges(editor, ranges, rule.formats, rule.fontSize ?? undefined, false)
      changed += ranges.length
    }
    editor.commands.setTextSelection(1)

    api.ai
      .logFeedback({
        documentId: documentId || undefined,
        predictionType: 'chat_preview',
        predictedFormat: 'learned',
        accepted: true,
      })
      .catch((error) => console.error('Chat preview acceptance feedback log failed', error))
    onFeedbackLogged?.()

    const label = `your usual formatting on ${changed} place${changed === 1 ? '' : 's'}`
    if (undoDepth(editor.state) > depthBefore) appliedStackRef.current.push({ depthBefore, label })
    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex ? { ...message, preview_status: 'applied', command_applied: label } : message
      )
    )
  }

  /** Scroll the document to the section an answer came from and put the caret there. */
  function jumpToSection(title: string): void {
    if (!editor || editor.isDestroyed) return
    if (title === 'Opening of the document') {
      editor.chain().focus().setTextSelection(1).scrollIntoView().run()
      return
    }
    const ranges = resolveTargetRanges(editor.state.doc, title, 'section')
    if (ranges.length === 0) return
    editor.chain().focus().setTextSelection(ranges[0].from).scrollIntoView().run()
  }

  /** Undo the most recent change applied from this chat; returns what was undone, or null when there is nothing. */
  function undoLastChatChange(): string | null {
    const last = appliedStackRef.current.pop()
    if (!editor || editor.isDestroyed || !last) return null
    // Formatting many blocks makes many undo steps (non-adjacent edits are not grouped); the guard only stops a runaway loop.
    for (let guard = 0; guard < 2000 && undoDepth(editor.state) > last.depthBefore; guard += 1) {
      if (!editor.commands.undo()) break
    }
    return last.label
  }

  /** Reject a formatting preview without changing the document. */
  function handlePreviewReject(
    messageIndex: number,
    format: string,
    reason?: string | null
  ): void {
    const rejectedPreview: RejectedFormattingPreview = {
      format,
      reason: reason ?? 'User rejected the preview suggestion.',
      rejectedAt: new Date().toISOString(),
    }

    setRejectedPreviews((current) => {
      if (current.some((preview) => preview.format === format)) {
        return current
      }

      return [...current, rejectedPreview]
    })

    if (documentId) {
      api.behavior
        .log({
          action: `chat_preview_rejected:${format}`,
          timestamp: rejectedPreview.rejectedAt ?? new Date().toISOString(),
          documentId,
        })
        .catch((error) => console.error('Chat preview rejection log failed', error))
    }

    api.ai
      .logFeedback({
        documentId: documentId || undefined,
        predictionType: 'chat_preview',
        predictedFormat: format,
        accepted: false,
      })
      .catch((error) => console.error('Chat preview rejection feedback log failed', error))

    onFeedbackLogged?.()


    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              preview_status: 'rejected',
            }
          : message
      )
    )
  }

  /** Send a message to the backend AI chat endpoint. */
  async function send(): Promise<void> {
    if (!input.trim() || loading) return

    const userMsg = input.trim()
    setInput('')
    setMessages((current) => [...current, { role: 'user', content: userMsg }])
    setLoading(true)

    // "Undo that" really reverts the last change applied from this chat; the
    // server cannot do that, so it is handled here without an AI call.
    if (/^\s*(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:undo|revert|take back|reverse)(?:\s+(?:that|it|this|the last(?:\s+(?:change|one|formatting))?|the change|the formatting))?\s*[.!?]*\s*$/i.test(userMsg)) {
      const undone = undoLastChatChange()
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: undone
            ? `Done — I undid ${undone}.`
            : 'There is nothing from this chat to undo yet. I can only take back changes I applied here.',
        },
      ])
      setLoading(false)
      return
    }

    const mcpCommand = parseMcpCommand(userMsg)
    if (mcpCommand) {
      try {
        const toolArgs: Record<string, unknown> = { ...mcpCommand.args }

        if (mcpCommand.tool === 'getDocumentContent' && documentId) {
          toolArgs.documentId = documentId
        }

        if (mcpCommand.tool === 'getBehaviorSummary' && documentId) {
          toolArgs.documentId = documentId
        }

        if (mcpCommand.tool === 'predictNextFormat') {
          toolArgs.text = documentContent
        }

        if (mcpCommand.tool === 'applyFormatting') {
          if (documentId) toolArgs.documentId = documentId
          if (!toolArgs.mode) toolArgs.mode = 'preview'
        }

        const result = await api.mcp.callTool(mcpCommand.tool as never, toolArgs)
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: `MCP ${mcpCommand.tool} result:\n${JSON.stringify(result, null, 2)}`,
          },
        ])

        // A committed applyFormatting call actually applies the format to the
        // editor (works with keyboard or mouse selections, or a collapsed cursor).
        if (
          mcpCommand.tool === 'applyFormatting' &&
          toolArgs.mode === 'commit' &&
          typeof toolArgs.format === 'string'
        ) {
          const command = SELECTION_COMMANDS[toolArgs.format]
          if (editor && command) {
            command(editor)
            onFormatApplied?.(toolArgs.format)
            if (documentId) {
              api.behavior
                .log({
                  action: `mcp_format_applied:${toolArgs.format}`,
                  timestamp: new Date().toISOString(),
                  documentId,
                })
                .catch((error) => console.error('MCP format applied log failed', error))
            }
          }
        }
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: error instanceof Error ? error.message : 'MCP tool call failed.',
          },
        ])
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const history: ChatHistoryEntry[] = messages
        .map((message) =>
          message.command_applied
            ? {
                role: 'assistant' as const,
                // Keep a compact record of what was applied so follow-ups like
                // "format the rest" know what already happened in this chat.
                content: `(Earlier in this chat the user applied: ${message.command_applied}.)`,
              }
            : {
                role: message.role,
                content: message.content,
              }
        )
        .slice(-6)

      const response = await api.ai.chat(
        userMsg,
        documentId,
        documentTitle,
        documentContent,
        history,
        rejectedPreviews,
        lastPreviewRef.current
      )

      const previewFormat =
        response.preview && typeof response.preview.format === 'string'
          ? response.preview.format
          : null
      const previewWasRejected =
        previewFormat !== null && hasRejectedPreview(previewFormat)
      const basePreviewReason =
        response.preview && typeof response.preview.reason === 'string'
          ? response.preview.reason
          : null
      const reconfirmationNote =
        previewWasRejected && previewFormat
          ? `\n\nYou previously rejected ${formatPreviewLabel(previewFormat)} in this chat. I’m showing it again because you asked for it; confirm only if you want to apply it now.`
          : ''
      const previewReason =
        previewWasRejected && previewFormat
          ? `${basePreviewReason ?? 'Detected a repeated formatting request.'} Previously rejected in this chat; confirm again before applying.`
          : basePreviewReason

      // "Apply my usual formatting": keep only the habits that match blocks of this document.
      if (previewFormat === 'learned') {
        const learned: LearnedPlace[] = editor && !editor.isDestroyed
          ? (response.preview?.learned ?? [])
              .map((rule) => ({ ...rule, places: findLearnedBlockRanges(editor.state.doc, rule.key).length }))
              .filter((rule) => rule.places > 0)
          : []
        const learnedMsg: ChatMessage = learned.length > 0
          ? {
              role: 'assistant',
              content: response.reply,
              preview_format: 'learned',
              preview_scope: 'all',
              preview_learned: learned,
              preview_reason: response.preview?.reason ?? null,
              preview_status: 'pending',
            }
          : {
              role: 'assistant',
              content: 'None of the paragraphs or headings in this document match your learned habits for this genre yet, so there is nothing to change.',
            }
        setMessages((current) => [...current, learnedMsg])
        return
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: `${response.reply}${reconfirmationNote}`,
        preview_format: previewFormat,
        preview_formats:
          response.preview?.formats && response.preview.formats.length > 0
            ? response.preview.formats
            : null,
        preview_scope: response.preview?.scope ?? null,
        preview_target: response.preview?.target ?? null,
        preview_target_mode: response.preview?.targetMode ?? null,
        preview_target_category: response.preview?.targetCategory ?? null,
        preview_normalize: response.preview?.normalize ?? false,
        preview_font_size: response.preview?.fontSize ?? null,
        preview_operations: response.preview?.operations && response.preview.operations.length > 0 ? response.preview.operations : null,
        preview_style: response.preview?.style ?? null,
        preview_preset_key: response.preview?.presetKey ?? null,
        preview_reason: previewFormat ? previewReason : null,
        preview_status: previewFormat ? 'pending' : null,
        sources: previewFormat ? undefined : response.sources,
      }

      // Remember the last shown preview so follow-ups ("back to normal",
      // "latter", "make it 12pt") resolve against the right change.
      lastPreviewRef.current = response.preview
        ? {
            format: previewFormat ?? undefined,
            formats:
              response.preview.formats && response.preview.formats.length > 0
                ? response.preview.formats
                : previewFormat ? [previewFormat] : [],
            scope: response.preview?.scope ?? 'selection',
            fontSize: response.preview?.fontSize ?? null,
            target: response.preview?.target ?? null,
            targetMode: response.preview?.targetMode ?? null,
            targetCategory: response.preview?.targetCategory ?? null,
            normalize: response.preview?.normalize ?? false,
            style: response.preview?.style ?? null,
            operations: response.preview?.operations,
          }
        : lastPreviewRef.current

      setMessages((current) => [...current, assistantMsg])
    } catch (error) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content:
          error instanceof Error
            ? `I couldn't reach the AI service: ${error.message}`
            : 'I couldn’t reach the AI service right now.',
      }

      setMessages((current) => [...current, assistantMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button (hidden when docked inside the side panel) */}
      {!docked && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px 0 rgba(0,0,0,0.1)',
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 150ms transform 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
          title="AI Assistant"
        >
          {open ? <X style={{ width: '16px', height: '16px' }} /> : <MessageSquare style={{ width: '16px', height: '16px' }} />}
        </button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {(open || docked) && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            style={{
              position: docked ? 'relative' : 'absolute',
              bottom: docked ? undefined : '56px',
              right: docked ? undefined : 0,
              width: docked ? '100%' : '320px',
              height: docked ? '100%' : undefined,
              backgroundColor: 'var(--card)',
              boxShadow: docked
                ? 'none'
                : 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
              borderRadius: docked ? 0 : '0.75rem',
              overflow: 'hidden',
              zIndex: docked ? undefined : 50,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
              <div style={{ width: '24px', height: '24px', backgroundColor: 'var(--primary)', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles style={{ width: '12px', height: '12px', color: 'var(--primary-foreground)' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>AI Assistant</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>Document-aware writing help</p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: docked ? 1 : undefined, height: docked ? '0px' : '256px', minHeight: 0, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                      backgroundColor: m.role === 'user' ? 'var(--primary)' : 'var(--secondary)',
                      color: m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {m.content}
                    {m.role === 'assistant' && m.sources ? (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem' }}>
                        {m.sources.map((source) => (
                          <button
                            key={source.title}
                            type="button"
                            onClick={() => jumpToSection(source.title)}
                            title="Show this part of the document"
                            style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0.125rem 0.5rem', borderRadius: '999px', border: '1px solid var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            From: {source.title}
                          </button>
                        ))}
                        <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>AI answer · check important details</span>
                      </div>
                    ) : null}
                    {m.preview_status || m.preview_format || (m.preview_formats?.length ?? 0) > 0 || m.preview_font_size ? (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem 0.625rem',
                          borderRadius: '0.5rem',
                          backgroundColor: 'var(--accent-subtle)',
                          border: '1px solid color-mix(in srgb, var(--accent-strong) 16%, transparent)',
                          color: m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            opacity: 0.75,
                            marginBottom: '0.25rem',
                          }}
                        >
                          Preview suggestion
                        </div>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            marginBottom: m.preview_reason || m.preview_scope ? '0.25rem' : 0,
                          }}
                        >
                          {describePreview(m)}
                          {m.preview_scope === 'all' && !(m.preview_operations && m.preview_operations.length > 1) && (
                            <span style={{ fontSize: '0.6875rem', fontWeight: 500, opacity: 0.75 }}>
                              {' '}
                              {previewScopeLabel(m)}
                            </span>
                          )}
                        </div>
                        {m.preview_reason && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              lineHeight: 1.45,
                              opacity: 0.8,
                            }}
                          >
                            {m.preview_reason}
                          </div>
                        )}
                        {m.preview_operations && m.preview_operations.length > 1 && (
                          <ol data-testid="preview-operations" style={{ margin: '0.375rem 0 0', paddingLeft: '1.1rem', listStyle: 'decimal', fontSize: '0.75rem', lineHeight: 1.45 }}>
                            {m.preview_operations.map((operation, index) => (
                              <li key={index}>{operation.summary}</li>
                            ))}
                          </ol>
                        )}
                        {m.preview_learned && (
                          <ul data-testid="learned-places" style={{ margin: '0.375rem 0 0', paddingLeft: '1rem', fontSize: '0.75rem', lineHeight: 1.45 }}>
                            {m.preview_learned.slice(0, 8).map((rule) => (
                              <li key={rule.key}>
                                “{rule.snippet.length > 48 ? `${rule.snippet.slice(0, 48)}…` : rule.snippet}” →{' '}
                                {[...rule.formats.map(formatPreviewLabel), ...(rule.fontSize ? [`${rule.fontSize}pt`] : [])].join(' + ')}
                                {rule.places > 1 ? ` (${rule.places} places)` : ''}
                              </li>
                            ))}
                            {m.preview_learned.length > 8 && <li>…and {m.preview_learned.length - 8} more</li>}
                          </ul>
                        )}

                        {m.preview_status === 'pending' && (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                            <button
                              type="button"
                              onClick={() => handlePreviewApply(i, m)}
                              style={{
                                flex: 1,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.375rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: 'none',
                                backgroundColor: 'var(--primary)',
                                color: 'var(--primary-foreground)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePreviewReject(i, m.preview_format as string, m.preview_reason)}
                              style={{
                                flex: 1,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.375rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                backgroundColor: 'transparent',
                                color: 'var(--muted-foreground)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {m.preview_status === 'rejected' && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.75rem',
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            Rejected
                          </div>
                        )}
                      </div>
                    ) : null}
                    {m.command_applied && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: 'var(--success)' }}>✓</span> Applied: {m.command_applied}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ backgroundColor: 'var(--secondary)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <Loader2 style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} className="animate-spin" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="Ask for writing or formatting help..."
                style={{
                  flex: 1,
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--secondary)',
                  borderRadius: '0.375rem',
                  padding: '0.5rem 0.75rem',
                  outline: 'none',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--ring)';
                  (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent)';
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() || loading ? 0.5 : 1,
                  transition: 'opacity 150ms, transform 120ms, box-shadow 150ms',
                }}
                onMouseEnter={(e) => {
                  if (input.trim() && !loading) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (input.trim() && !loading) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                  }
                }}
              >
                <Send style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
