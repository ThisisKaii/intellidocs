import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'
import { editorUndoDepth, startNewUndoStep } from './undoDepth'
import { api, type AIAutomation, type AIClarify, type AISuggestionGroup, type MarginValues, type PageOrientation, type PageSizeKey, type AIChatBlockCategory, type AIChatResponse, type AIChatFormattingOperation, type AIChatPreviewMeta, type AIChatStyleChange, type AIChatTargetCategory, type AIChatTargetMode, type AIGroundedPaper, type AIStructuredSection, type AIToneRefinement, type LearnedFormattingRule, type RejectedFormattingPreview } from '@/services/api'
import { applyFormatsToRanges, findPlacedRanges, applyFormatsToSelection, applyStyle, findCategoryRanges, findLearnedBlockRanges, hasStyle, preferWholeBlocks, replaceTextsInRange, resolveTargetRanges, type BlockCategory, type TextRange } from './chatFormatting'
import { pageFinder } from './DocumentParts'
import { AutoCaptionCard, AutomationCard, CitationsCard, ClarifyCard, RefineCard, StructureCard, type CardStatus, type EditStatus } from './WritingAssistCards'
import { captionsWithoutTitle, planAutoCaptions, type AutoCaptionItem } from './autoCaption'
import { findCaptions, misnumberedCaptions, resolveCaptionConfig, type CaptionContext, type CaptionKind, type CaptionStyleSpec } from './captionNumbering'
import { buildStructuredSectionContent, headingLevelAt } from './structuredSection'
import { findAcademicPreset } from './academicPresets'
import { getEditorPreferences, setEditorPreferences, subscribeEditorPreferences } from '@/lib/editorPreferences'
import { AUTONOMY_WARNING, asksForMoreThanPermission, detectAutonomyRequest } from '@/lib/assistantAutonomy'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Asks the user to confirm turning on "apply without asking" (with the warning). */
  autonomy_prompt?: 'pending' | 'accepted' | 'declined' | null
  /** This change was applied without asking, because the mode was on. */
  auto_applied?: boolean
  command_applied?: string | null
  preview_format?: string | null
  preview_formats?: string[] | null
  preview_scope?: 'selection' | 'all' | null
  preview_target?: string | null
  preview_target_mode?: AIChatTargetMode | null
  preview_target_category?: AIChatTargetCategory | null
  /** A block picked by position (1-based, -1 = last) and/or a page ("the 2nd paragraph on page 3"). */
  preview_target_index?: number | null
  preview_target_page?: number | 'current' | null
  /** The opening words of the block a positional change picked, to check before Apply. */
  preview_place_text?: string | null
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
  /** "Organise my notes…": the user's notes as a section, inserted on confirmation. */
  structured?: AIStructuredSection | null
  /** "Find citations…": real papers the user ticks to cite. */
  papers?: AIGroundedPaper[] | null
  /** "Refine this…": revisions of the user's own text, applied one by one. */
  refinement?: AIToneRefinement | null
  /** "Auto caption": the figures and tables without a caption when the request came in. */
  auto_captions?: AutoCaptionItem[] | null
  caption_kinds?: CaptionKind[] | null
  /** After captions were added: how many still have no title. */
  captions_untitled?: number | null
  /** An automation card: what it runs, what it will change (listed when shown), and its outcome. */
  automation?: AIAutomation | null
  automation_lines?: string[] | null
  automation_result?: string | null
  /** Chosen by the AI fallback (no fixed rule recognised the request): marked, and reported back. */
  routed_by_ai?: boolean
  route_id?: string | null
  /** "Which did you mean?" and its options; the option picked, once answered. */
  clarify?: AIClarify | null
  clarify_choice?: string | null
  /** For a change to a kind of block: how many blocks of the document it matches. */
  preview_block_count?: number | null
  /** State of a structure or citations card. */
  assist_status?: CardStatus | null
  /** State of each revision in `refinement.edits`. */
  edit_statuses?: EditStatus[] | null
  /** The selection when the request was sent, and its text, to cite after or refine inside. */
  assist_range?: TextRange | null
  assist_selection?: string | null
}

/** A learned habit and how many blocks of the open document it matches. */
interface LearnedPlace extends LearnedFormattingRule {
  places: number
}

/** Most chat messages kept per document for the session (about 10 turns). */
const STORED_MESSAGES = 20

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Hello! I’m your IntelliDocs AI assistant. I can help you think through formatting, wording, and document edits. I ask before I change your document; if you would rather I apply changes on my own, just tell me.',
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
  /**
   * A document split into tabs: the title of the other tab a target ("the Introduction") is in,
   * when it is not in the open one; null when no tab has it.
   */
  locateInOtherTab?: (target: string) => string | null
  /** Note structuring, citation and refinement wiring from the document page. */
  writingAssist?: WritingAssistWiring
  /** Page setup, formatting fixes and the reference list, from the document page. */
  automations?: AutomationWiring
}

/** A formatting fix the document's scanner found, as an automation lists it. */
export interface PendingFix {
  key: string
  label: string
}

/** What the document page provides for the automation cards. */
export interface AutomationWiring {
  pageSetup: { pageSize: PageSizeKey; orientation: PageOrientation; margins: MarginValues }
  applyPageSetup: (change: { pageSize?: PageSizeKey; orientation?: PageOrientation; margins?: MarginValues }) => void
  /** The scanner's open fixes of one group. */
  pendingFixes: (only: AISuggestionGroup) => PendingFix[]
  /** Apply these fixes; returns how many were applied. */
  applyFixes: (keys: string[]) => number
  /** How many sources the document cites, and the style its reference list is written in. */
  references: () => { count: number; styleLabel: string }
  /** Write (or rewrite) the reference list; false when there is nothing to write. */
  insertBibliography: () => boolean
  /**
   * Save the document as a named History version ("Before the assistant: …") before a big
   * change, so Restore can go back to just before it. Best-effort: never blocks the change.
   */
  checkpoint: (description: string) => Promise<void>
}

const PAGE_SIZE_NAMES: Record<PageSizeKey, string> = { short: 'Short', long: 'Long', a4: 'A4', letter: 'Letter', legal: 'Legal' }

/** Each automation in words, for its History checkpoint. */
const AUTOMATION_NAMES: Record<AIAutomation['action'], string> = {
  renumberCaptions: 'Renumber captions',
  fixSuggestions: 'Formatting fixes',
  pageSetup: 'Page setup',
  bibliography: 'Reference list',
}

/** What the document page provides for the writing-assist cards. */
export interface WritingAssistWiring {
  /** The document's formatting preset key, for the inserted section's heading and indent. */
  activePreset: string | null
  /** Label of the citation style new citations go in as, e.g. "IEEE [1]". */
  citationStyleLabel: string
  /** Cite the ticked papers after `at` (or at the cursor) and add them to the references. */
  onAddCitations: (papers: AIGroundedPaper[], at: TextRange | null) => void
  /** A message to send as if typed (the bubble menu's "Find citations"). */
  pendingPrompt: string | null
  onPendingPromptConsumed: () => void
  /** The ribbon's "Auto caption": show the caption card without a round trip to the server. */
  pendingAutoCaption?: boolean
  onPendingAutoCaptionConsumed?: () => void
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
  targetIndex?: number | null
  targetPage?: number | 'current' | null
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
  if (style.fontSizeStep) labels.push(`font size ${style.fontSizeStep > 0 ? '+' : '−'}${Math.abs(style.fontSizeStep)}pt`)
  return labels
}

/** How each block category reads in an "applied" note. */
const CATEGORY_NOTES: Record<AIChatBlockCategory, string> = {
  headings: 'all headings',
  h1Headings: 'every Heading 1',
  h2Headings: 'every Heading 2',
  h3Headings: 'every Heading 3',
  sections: 'every section heading',
  chapters: 'every chapter heading',
  paragraphs: 'all body paragraphs',
  questions: 'the research questions',
  lists: 'every list',
  bulletLists: 'every bulleted list',
  numberedLists: 'every numbered list',
  tables: 'every table',
  captions: 'every figure and table caption',
  quotes: 'every block quote',
}

/** Each block category as a group noun, for "everything except the headings". */
const CATEGORY_NOUNS: Record<AIChatBlockCategory, string> = {
  headings: 'the headings',
  h1Headings: 'the Heading 1 headings',
  h2Headings: 'the Heading 2 headings',
  h3Headings: 'the Heading 3 headings',
  sections: 'the section headings',
  chapters: 'the chapter headings',
  paragraphs: 'the body paragraphs',
  questions: 'the research questions',
  lists: 'the lists',
  bulletLists: 'the bulleted lists',
  numberedLists: 'the numbered lists',
  tables: 'the tables',
  captions: 'the captions',
  quotes: 'the block quotes',
}

/** A category as words: "all headings", "everything except the headings". */
function categoryNote(category: BlockCategory): string {
  const excepted = /^except:(.+)$/.exec(category)?.[1]
  const base = (excepted ?? category) as AIChatBlockCategory
  return excepted ? `everything except ${CATEGORY_NOUNS[base]}` : CATEGORY_NOTES[base]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Arguments that are lists even when one value is given ("formats=bold"). */
const MCP_LIST_ARGS = new Set(['formats', 'kinds'])
/** Free-text arguments, kept exactly as typed. */
const MCP_TEXT_ARGS = new Set(['text', 'query', 'claimText', 'userNotes', 'sectionTitle', 'target', 'fontFamily', 'reason', 'selection'])

/**
 * A typed /mcp value as the tool expects it: JSON for {…} and […], numbers, true/false, and
 * comma lists for list arguments. Free text stays text. The server checks every value.
 */
export function mcpArgValue(key: string, value: string): unknown {
  if (MCP_TEXT_ARGS.has(key)) return value
  if (/^[[{]/.test(value)) {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return value
    }
  }
  if (MCP_LIST_ARGS.has(key)) return value.split(',').map((item) => item.trim()).filter(Boolean)
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if (value === 'true' || value === 'false') return value === 'true'
  if (value === 'null') return null
  return value
}

/** A /mcp writing-assist tool's result as a chat card payload; null for every other tool. */
function mcpWritingAssist(
  tool: string,
  result: unknown
): { reply: string; structured?: AIStructuredSection; papers?: AIGroundedPaper[]; refinement?: AIToneRefinement } | null {
  if (!isRecord(result)) return null
  if (tool === 'structureUserSection') {
    if (typeof result.declined === 'string') return { reply: result.declined }
    if (typeof result.sectionTitle === 'string' && Array.isArray(result.outline) && Array.isArray(result.paragraphs) && Array.isArray(result.warnings)) {
      return {
        reply: 'Here are your notes organised into a section. Check the wording, then insert it at your cursor.',
        structured: result as unknown as AIStructuredSection,
      }
    }
  }
  if (tool === 'searchLiteratureAndCite' && Array.isArray(result.papers)) {
    const papers = result.papers as AIGroundedPaper[]
    return papers.length > 0
      ? { reply: `I found ${papers.length} published paper${papers.length === 1 ? '' : 's'}. Check each abstract, then tick the ones to cite.`, papers }
      : { reply: 'No published papers matched that query.' }
  }
  if (tool === 'refineAcademicStyle' && Array.isArray(result.edits) && Array.isArray(result.notices) && typeof result.sourceText === 'string') {
    return { reply: 'Here are the suggested revisions. Nothing changes until you apply one.', refinement: result as unknown as AIToneRefinement }
  }
  return null
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
  automations,
  locateInOtherTab,
  writingAssist,
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
  // "Apply without asking": a saved preference, also switched from Settings.
  const [autoApply, setAutoApply] = useState<boolean>(() => getEditorPreferences().assistantAutoApply)
  useEffect(() => subscribeEditorPreferences((prefs) => setAutoApply(prefs.assistantAutoApply)), [])

  /** Turn "apply without asking" on or off (saved with the editor preferences). */
  function setAutonomy(on: boolean): void {
    setAutoApply(setEditorPreferences({ assistantAutoApply: on }).assistantAutoApply)
  }

  /** Answer the confirmation card: turn the mode on, or keep asking. */
  function answerAutonomyPrompt(messageIndex: number, accept: boolean): void {
    if (accept) {
      setAutonomy(true)
      // A change proposed alongside the permission ("…without asking, bold the headings") goes in now.
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message.role === 'assistant' && message.preview_status === 'pending') {
          if (!(message.preview_format && hasRejectedPreview(message.preview_format))) handlePreviewApply(index, { ...message, auto_applied: true })
          break
        }
      }
    }
    setMessages((current) => [
      ...current.map((message, index) =>
        index === messageIndex ? { ...message, autonomy_prompt: accept ? ('accepted' as const) : ('declined' as const) } : message
      ),
      {
        role: 'assistant' as const,
        content: accept
          ? 'Apply without asking is on. I will make the changes I suggest right away; say “undo that” to take one back, or “ask me first” to turn this off.'
          : 'OK, I will keep asking before I change anything.',
      },
    ])
  }

  // While the mode is on, a change the assistant proposes is applied as soon as it arrives.
  useEffect(() => {
    if (!autoApply || !editor || editor.isDestroyed || !editor.isEditable) return
    const index = messages.length - 1
    const last = messages[index]
    if (!last || last.role !== 'assistant') return
    // Automations and Auto caption too: each is saved as a History version first, so Restore undoes it.
    if (last.assist_status === 'pending' && !last.auto_applied) {
      if (last.automation && (last.automation_lines?.length ?? 0) > 0) {
        const automation = last.automation
        setMessages((current) => current.map((message, i) => (i === index ? { ...message, auto_applied: true } : message)))
        runAutomation(index, automation, last.automation_lines ?? [])
        return
      }
      if (last.auto_captions && last.auto_captions.length > 0) {
        setMessages((current) => current.map((message, i) => (i === index ? { ...message, auto_applied: true } : message)))
        addAutoCaptions(index, last.caption_kinds ?? ['figure', 'table'])
        return
      }
    }
    if (last.preview_status !== 'pending') return
    // "Previously rejected" changes still wait: the user said no to them in this chat.
    if (last.preview_format && hasRejectedPreview(last.preview_format)) return
    setMessages((current) => current.map((message, i) => (i === index ? { ...message, auto_applied: true } : message)))
    handlePreviewApply(index, last)
    // handlePreviewApply and hasRejectedPreview read current state; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, messages, editor])

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
      // A block picked by position: its opening words (the reason line says where), or how many.
      if ((msg.preview_target_index ?? null) !== null || (msg.preview_target_page ?? null) !== null) {
        const count = msg.preview_block_count ?? 0
        if (count === 0) return '— nothing there in this document'
        if (msg.preview_target_index !== null && msg.preview_target_index !== undefined) return `— “${msg.preview_place_text ?? ''}”`
        return `— ${count} block${count === 1 ? '' : 's'}`
      }
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
      if (msg.preview_target_category && msg.preview_target_category !== 'all') {
        // How many blocks it matches, so a wrong reading ("0 tables") shows before Apply.
        const count = msg.preview_block_count
        const counted = count === null || count === undefined ? '' : count === 0 ? ' (none in this document)' : ` (${count})`
        return `— ${categoryNote(msg.preview_target_category)}${counted}`
      }
      return '— entire document'
    }
    return ''
  }

  /** Parse key=value arguments for MCP tool calls. */
  function parseMcpArgs(raw: string): Record<string, string> {
    const args: Record<string, string> = {}
    // A value runs until the next " key=", so "text=This proves it focus=all" keeps its spaces.
    for (const match of raw.matchAll(/(\w+)=((?:(?!\s+\w+=)[\s\S])*)/g)) {
      args[match[1]] = match[2].trim()
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
      scope === 'all' && targetCategory && targetCategory !== 'all' ? ` (${categoryNote(targetCategory)})` : ''

    let targetWarning = ''
    const positional = (change.targetIndex ?? null) !== null || (change.targetPage ?? null) !== null
    if (positional && scope === 'all') {
      const ranges = placedRanges(change)
      if (ranges.length === 0) targetWarning = ' (nothing there in this document now)'
      else applyFormatsToRanges(editor, ranges, formats, fontSize, normalize, style)
    } else if (target && scope === 'all') {
      const places = applyFormatsToTarget(target, change.targetMode, formats, fontSize, normalize, style)
      if (places === 0) {
        const elsewhere = locateInOtherTab?.(target) ?? null
        targetWarning = elsewhere
          ? ` (“${target}” is in the “${elsewhere}” tab: open that tab and ask again)`
          : ` (could not find "${target}" in the document)`
      }
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

    return `${describeChangeParts(change, fallbackFormat).join(' + ')}${target && scope === 'all' && !positional ? ` on “${target}”` : ''}${positional ? '' : scopeNote}${targetWarning}`
  }

  /** Apply a confirmed formatting preview to the editor (selection or whole doc). */
  /** Cards whose change is waiting for its History checkpoint, so a second click does nothing. */
  const checkpointingRef = useRef(new Set<number>())

  /**
   * Run a big change after saving the document as a named History version, so Restore can go
   * back to just before it. The change happens whether or not the checkpoint could be saved.
   */
  function afterCheckpoint(messageIndex: number, description: string, change: () => void): void {
    if (!automations) {
      change()
      return
    }
    if (checkpointingRef.current.has(messageIndex)) return
    checkpointingRef.current.add(messageIndex)
    void automations
      .checkpoint(description)
      .catch(() => undefined)
      .finally(() => {
        checkpointingRef.current.delete(messageIndex)
        change()
      })
  }

  /** Apply a preview card; a change to the whole document is checkpointed in History first. */
  function handlePreviewApply(messageIndex: number, msg: ChatMessage): void {
    reportRoute(msg, true)
    const big = Boolean(msg.preview_learned || msg.preview_preset_key || msg.preview_operations?.length || msg.preview_scope === 'all')
    if (!big) {
      applyPreviewNow(messageIndex, msg)
      return
    }
    afterCheckpoint(messageIndex, `${describePreview(msg)} ${previewScopeLabel(msg)}`.trim(), () => applyPreviewNow(messageIndex, msg))
  }

  function applyPreviewNow(messageIndex: number, msg: ChatMessage): void {
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
      targetIndex: msg.preview_target_index ?? null,
      targetPage: msg.preview_target_page ?? null,
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
            targetIndex: operation.targetIndex ?? null,
            targetPage: operation.targetPage ?? null,
            normalize: operation.normalize,
            style: operation.style ?? null,
          }))
        : [single]

    // Every change of the request is applied here, one after another, and
    // recorded as one entry so "undo that" takes them all back together.
    startNewUndoStep(editor.state)
    const depthBefore = editorUndoDepth(editor.state)
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
    if (editorUndoDepth(editor.state) > depthBefore) {
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
    startNewUndoStep(editor.state)
    const depthBefore = editorUndoDepth(editor.state)
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
    if (editorUndoDepth(editor.state) > depthBefore) appliedStackRef.current.push({ depthBefore, label })
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
    for (let guard = 0; guard < 2000 && editorUndoDepth(editor.state) > last.depthBefore; guard += 1) {
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
    reportRoute(messages[messageIndex], false)
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

  /** Update one message of the chat. */
  function patchMessage(messageIndex: number, patch: Partial<ChatMessage>): void {
    setMessages((current) => current.map((message, index) => (index === messageIndex ? { ...message, ...patch } : message)))
  }

  /** Run one document change from a writing-assist card as its own undo step ("undo that" reverts it). */
  function recordChange(label: string, change: (target: Editor) => boolean): boolean {
    if (!editor || editor.isDestroyed || !editor.isEditable) return false
    startNewUndoStep(editor.state)
    const depthBefore = editorUndoDepth(editor.state)
    const changed = change(editor)
    if (changed && editorUndoDepth(editor.state) > depthBefore) appliedStackRef.current.push({ depthBefore, label })
    return changed
  }

  /** Insert the organised section after the block holding the cursor (replacing it when it is an empty line). */
  function insertStructured(messageIndex: number, section: AIStructuredSection): void {
    const inserted = recordChange(`the organised “${section.sectionTitle}” section`, (target) => {
      const { $to } = target.state.selection
      const emptyLine = $to.depth > 0 && $to.parent.isTextblock && $to.parent.textContent.trim() === '' && $to.depth === 1
      const at: number | TextRange = emptyLine
        ? { from: $to.before(1), to: $to.after(1) }
        : $to.depth > 0
          ? $to.after(1)
          : $to.pos
      const pos = typeof at === 'number' ? at : at.from
      const content = buildStructuredSectionContent(section, findAcademicPreset(writingAssist?.activePreset), headingLevelAt(target.state.doc, pos))
      return target.chain().focus().insertContentAt(at, content).run()
    })
    if (inserted) patchMessage(messageIndex, { assist_status: 'done' })
  }

  /** The caption numbering settings the editor is using now. */
  function captionSettings(): { style: CaptionStyleSpec; context: CaptionContext | null } {
    const storage = (editor?.storage as unknown as { captions?: { labelStyle?: CaptionStyleSpec; context?: CaptionContext | null } } | undefined)?.captions
    return { style: storage?.labelStyle ?? 'default', context: storage?.context ?? null }
  }

  /** What an automation would change in the open document, line by line (empty: nothing to do). */
  function automationLines(automation: AIAutomation): string[] {
    if (!editor || editor.isDestroyed) return []
    if (automation.action === 'renumberCaptions') {
      const { style, context } = captionSettings()
      return misnumberedCaptions(findCaptions(editor.state.doc), style, false, context).map(({ entry, expected }) => `${entry.label} becomes ${expected}`)
    }
    if (!automations) return []
    if (automation.action === 'fixSuggestions') return automations.pendingFixes(automation.only).map((fix) => fix.label)
    if (automation.action === 'bibliography') {
      const { count, styleLabel } = automations.references()
      return count > 0 ? [`${count} cited source${count === 1 ? '' : 's'}, written in ${styleLabel}`] : []
    }
    const current = automations.pageSetup
    const lines: string[] = []
    if (automation.pageSize && automation.pageSize !== current.pageSize) lines.push(`Page size: ${PAGE_SIZE_NAMES[current.pageSize]} to ${PAGE_SIZE_NAMES[automation.pageSize]}`)
    if (automation.orientation && automation.orientation !== current.orientation) lines.push(`Orientation: ${current.orientation} to ${automation.orientation}`)
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const next = automation.margins?.[side]
      if (next !== undefined && next !== current.margins[side]) lines.push(`${side[0].toUpperCase()}${side.slice(1)} margin: ${current.margins[side]}in to ${next}in`)
    }
    return lines
  }

  /** A card for an automation, listing what it would change right now. */
  function automationMessage(reply: string, automation: AIAutomation): ChatMessage {
    return { role: 'assistant', content: reply, automation, automation_lines: automationLines(automation), assist_status: 'pending' }
  }

  /** Run an automation the user applied, after saving a History checkpoint of the document. */
  function runAutomation(messageIndex: number, automation: AIAutomation, lines: string[]): void {
    reportRoute(messages[messageIndex], true)
    const what = lines.length > 0 ? `${AUTOMATION_NAMES[automation.action]} (${lines.slice(0, 3).join('; ')}${lines.length > 3 ? '; …' : ''})` : AUTOMATION_NAMES[automation.action]
    afterCheckpoint(messageIndex, what, () => runAutomationNow(messageIndex, automation))
  }

  /** Run an automation now, as one undo step where the editor allows it. */
  function runAutomationNow(messageIndex: number, automation: AIAutomation): void {
    if (!editor || editor.isDestroyed) return
    let result: string | null = null
    if (automation.action === 'renumberCaptions') {
      const count = automationLines(automation).length
      const changed = count > 0 && recordChange('the caption numbers', (target) => target.chain().focus().renumberCaptions().run())
      result = changed ? `✓ Renumbered ${count} caption${count === 1 ? '' : 's'}` : 'Every caption was already numbered in order.'
    } else if (automations && automation.action === 'fixSuggestions') {
      const keys = automations.pendingFixes(automation.only).map((fix) => fix.key)
      const applied = keys.length > 0 ? automations.applyFixes(keys) : 0
      result = applied > 0 ? `✓ Applied ${applied} fix${applied === 1 ? '' : 'es'}` : 'There were no open fixes left to apply.'
    } else if (automations && automation.action === 'bibliography') {
      result = automations.insertBibliography() ? '✓ Reference list written' : 'This document cites no sources yet.'
    } else if (automations && automation.action === 'pageSetup') {
      automations.applyPageSetup({
        pageSize: automation.pageSize,
        orientation: automation.orientation,
        margins: automation.margins ? { ...automations.pageSetup.margins, ...automation.margins } : undefined,
      })
      result = '✓ Page setup changed'
    }
    patchMessage(messageIndex, { assist_status: 'done', automation_result: result })
  }

  /** The figures and tables of these kinds that have no caption, under the document's caption settings. */
  function planCaptions(kinds: CaptionKind[]): AutoCaptionItem[] {
    if (!editor || editor.isDestroyed) return []
    const style = (editor.storage as unknown as { captions?: { labelStyle?: CaptionStyleSpec } }).captions?.labelStyle ?? 'default'
    return planAutoCaptions(editor.state.doc, resolveCaptionConfig(style), kinds)
  }

  /** A card listing what "Auto caption" would caption. */
  function autoCaptionMessage(reply: string, kinds: CaptionKind[]): ChatMessage {
    return { role: 'assistant', content: reply, auto_captions: planCaptions(kinds), caption_kinds: kinds, assist_status: 'pending' }
  }

  /** Add every missing caption in one step (one undo), after a History checkpoint. */
  function addAutoCaptions(messageIndex: number, kinds: CaptionKind[]): void {
    reportRoute(messages[messageIndex], true)
    const count = planCaptions(kinds).length
    afterCheckpoint(messageIndex, `Auto caption (${count} caption${count === 1 ? '' : 's'})`, () => addAutoCaptionsNow(messageIndex, kinds))
  }

  function addAutoCaptionsNow(messageIndex: number, kinds: CaptionKind[]): void {
    const added = recordChange('the added captions', (target) => target.chain().focus().insertAutoCaptions(kinds).run())
    if (!added || !editor) {
      patchMessage(messageIndex, { auto_captions: planCaptions(kinds) })
      return
    }
    patchMessage(messageIndex, { assist_status: 'done', captions_untitled: captionsWithoutTitle(editor.state.doc).length })
    goToNextUntitledCaption()
  }

  /** Put the cursor at the end of the next caption (after the cursor, wrapping round) that has no title. */
  function goToNextUntitledCaption(): void {
    if (!editor || editor.isDestroyed) return
    const untitled = captionsWithoutTitle(editor.state.doc)
    if (untitled.length === 0) return
    const cursor = editor.state.selection.from
    const pos = untitled.find((at) => at + 1 > cursor) ?? untitled[0]
    const node = editor.state.doc.nodeAt(pos)
    if (!node) return
    editor.chain().focus().setTextSelection(pos + node.nodeSize - 1).scrollIntoView().run()
  }

  /** Cite the ticked papers where the selection was when the user asked, if that text is still there. */
  function citePapers(messageIndex: number, message: ChatMessage, papers: AIGroundedPaper[]): void {
    if (!writingAssist || papers.length === 0 || !editor || editor.isDestroyed) return
    const range = message.assist_range
    const stillThere =
      range && message.assist_selection && range.to <= editor.state.doc.content.size &&
      editor.state.doc.textBetween(range.from, range.to, '\n') === message.assist_selection
    writingAssist.onAddCitations(papers, stillThere ? range : null)
    patchMessage(messageIndex, { assist_status: 'done' })
  }

  /** Apply some of a refinement's revisions; ones whose text has changed are marked stale. */
  function applyRevisions(messageIndex: number, message: ChatMessage, indices: number[]): void {
    const refinement = message.refinement
    if (!refinement) return
    const statuses = [...(message.edit_statuses ?? refinement.edits.map((): EditStatus => 'pending'))]
    const label = indices.length === 1 ? 'a revision' : `${indices.length} revisions`
    const chosen = indices.filter((index) => refinement.edits[index] && statuses[index] === 'pending')
    recordChange(label, (target) => {
      // All chosen revisions go in as one transaction, so one undo reverts them together.
      const applied = replaceTextsInRange(target, message.assist_range ?? null, chosen.map((index) => refinement.edits[index]))
      chosen.forEach((index, k) => {
        statuses[index] = applied[k] ? 'applied' : 'stale'
      })
      return applied.some(Boolean)
    })
    patchMessage(messageIndex, { edit_statuses: statuses })
  }

  /** The assistant message for a writing-assist response (organise, cite, refine). */
  function writingAssistMessage(
    reply: string,
    payload: { structured?: AIStructuredSection; papers?: AIGroundedPaper[]; refinement?: AIToneRefinement },
    selection: { range: TextRange | null; text: string }
  ): ChatMessage {
    const base: ChatMessage = { role: 'assistant', content: reply, assist_range: selection.range, assist_selection: selection.text || null }
    if (payload.structured) return { ...base, structured: payload.structured, assist_status: 'pending' }
    if (payload.papers && payload.papers.length > 0) return { ...base, papers: payload.papers, assist_status: 'pending' }
    if (payload.refinement) return { ...base, refinement: payload.refinement, edit_statuses: payload.refinement.edits.map((): EditStatus => 'pending') }
    return base
  }

  // The bubble menu's "Find citations": send its prompt as soon as the chat is free.
  useEffect(() => {
    const prompt = writingAssist?.pendingPrompt
    if (!prompt || loading) return
    writingAssist.onPendingPromptConsumed()
    void send(prompt)
    // send reads current state; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writingAssist?.pendingPrompt, loading])

  // The ribbon's "Auto caption": the card is built here, from the open document.
  useEffect(() => {
    if (!writingAssist?.pendingAutoCaption) return
    writingAssist.onPendingAutoCaptionConsumed?.()
    setMessages((current) => [
      ...current,
      { role: 'user', content: 'Auto caption the figures and tables' },
      autoCaptionMessage('Here is every figure and table without a caption. Titles come only from your own words in the document; the rest are left for you to write.', ['figure', 'table']),
    ])
    // autoCaptionMessage reads the current document; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writingAssist?.pendingAutoCaption])

  /**
   * Show a reply as a message: a chat answer, or the card for what it would change (formatting,
   * preset, learned habits, captions, an automation, writing help). Typed requests and /mcp tool
   * results both come through here, so the same change always gets the same card.
   */
  function showResponse(response: AIChatResponse, selection: { range: TextRange | null; text: string }): void {
    // A change the AI chose is marked as such, and reports back whether it was applied.
    const routed: Partial<ChatMessage> = response.routedBy === 'ai' ? { routed_by_ai: true, route_id: response.routeId ?? null } : {}
    const add = (message: ChatMessage): void => setMessages((current) => [...current, { ...message, ...routed }])

    if (response.mode === 'clarify' && response.clarify) {
      add({ role: 'assistant', content: response.reply, clarify: response.clarify })
      return
    }

    if (response.mode === 'captions') {
      add(autoCaptionMessage(response.reply, response.captionKinds ?? ['figure', 'table']))
      return
    }

    if (response.mode === 'automation' && response.automation) {
      add(automationMessage(response.reply, response.automation))
      return
    }

    if (response.mode === 'structure' || response.mode === 'citations' || response.mode === 'refine') {
      add(writingAssistMessage(response.reply, { structured: response.structured, papers: response.papers, refinement: response.refinement }, selection))
      return
    }

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
      add(learnedMsg)
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
      preview_target_index: response.preview?.targetIndex ?? null,
      preview_target_page: response.preview?.targetPage ?? null,
      preview_normalize: response.preview?.normalize ?? false,
      preview_font_size: response.preview?.fontSize ?? null,
      preview_operations: response.preview?.operations && response.preview.operations.length > 0 ? response.preview.operations : null,
      preview_style: response.preview?.style ?? null,
      preview_preset_key: response.preview?.presetKey ?? null,
      preview_reason: previewFormat ? previewReason : null,
      preview_status: previewFormat ? 'pending' : null,
      ...previewPlace(response.preview ?? null),
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
          targetIndex: response.preview?.targetIndex ?? null,
          targetPage: response.preview?.targetPage ?? null,
          normalize: response.preview?.normalize ?? false,
          style: response.preview?.style ?? null,
          operations: response.preview?.operations,
        }
      : lastPreviewRef.current

    add(assistantMsg)
  }

  /** The blocks a positional change points at, under the editor's current layout. */
  function placedRanges(change: Pick<PlannedChange, 'targetCategory' | 'targetIndex' | 'targetPage' | 'target'>): TextRange[] {
    if (!editor || editor.isDestroyed) return []
    let pageOf: ((pos: number) => number) | null = null
    try {
      pageOf = pageFinder(editor)
    } catch {
      pageOf = null
    }
    return findPlacedRanges(
      editor.state.doc,
      { category: change.targetCategory ?? 'all', index: change.targetIndex ?? null, page: change.targetPage ?? null, within: change.target },
      pageOf,
      pageOf ? pageOf(editor.state.selection.from) : null
    )
  }

  /** What a preview matches now: how many blocks, and for a block picked by position, its opening words. */
  function previewPlace(preview: AIChatResponse['preview'] | null): Pick<ChatMessage, 'preview_block_count' | 'preview_place_text'> {
    if (!preview || !editor || editor.isDestroyed) return { preview_block_count: null, preview_place_text: null }
    if ((preview.targetIndex ?? null) !== null || (preview.targetPage ?? null) !== null) {
      const ranges = placedRanges({ targetCategory: preview.targetCategory ?? null, targetIndex: preview.targetIndex ?? null, targetPage: preview.targetPage ?? null, target: preview.target ?? null })
      const first = ranges[0]
      const text = first ? editor.state.doc.textBetween(first.from, first.to, ' ').trim() : ''
      return { preview_block_count: ranges.length, preview_place_text: text.length > 60 ? `${text.slice(0, 60)}…` : text }
    }
    return { preview_block_count: blockCount(preview.scope ?? null, preview.targetCategory ?? null), preview_place_text: null }
  }

  /** How many blocks a change to a kind of block would touch now (null for other changes). */
  function blockCount(scope: 'selection' | 'all' | null, category: AIChatTargetCategory | null): number | null {
    if (scope !== 'all' || !category || category === 'all' || !editor || editor.isDestroyed) return null
    return findCategoryRanges(editor.state.doc, category).length
  }

  /** Report whether an AI-chosen change was applied, so a rejected route is asked afresh next time. */
  function reportRoute(message: ChatMessage | undefined, applied: boolean): void {
    if (!message?.route_id) return
    api.ai.routeFeedback(message.route_id, applied).catch(() => undefined)
  }

  /** "Which did you mean?": show the card for the option picked. */
  function pickClarifyOption(messageIndex: number, message: ChatMessage, option: AIClarify['options'][number]): void {
    patchMessage(messageIndex, { clarify_choice: option.label })
    showResponse({ provider: 'assistant', model: 'clarify', ...option.card, routedBy: 'ai', routeId: message.route_id ?? undefined }, { range: null, text: '' })
  }

  /** Dismiss a card; for an AI-chosen change that is a rejection. */
  function dismissCard(messageIndex: number, message: ChatMessage): void {
    reportRoute(message, false)
    patchMessage(messageIndex, { assist_status: 'dismissed' })
  }

  /** Send a message to the backend AI chat endpoint (the typed input, or `text` when given). */
  async function send(text?: string): Promise<void> {
    const typed = text === undefined
    if (!(typed ? input : text).trim() || loading) return

    const userMsg = (typed ? input : text).trim()
    if (typed) setInput('')
    // What the user had selected: "refine this" and "find citations for this" mean it.
    const selection = editor && !editor.isDestroyed && !editor.state.selection.empty ? editor.state.selection : null
    const selectionRange: TextRange | null = selection ? { from: selection.from, to: selection.to } : null
    const selectionText = selection && editor ? editor.state.doc.textBetween(selection.from, selection.to, '\n') : ''
    setMessages((current) => [...current, { role: 'user', content: userMsg }])

    // "You can do it without asking" / "ask me first": the apply-without-asking mode. Turning it
    // on always goes through a confirmation card with the warning; turning it off is immediate.
    const autonomy = detectAutonomyRequest(userMsg)
    if (autonomy) {
      const reply: ChatMessage =
        autonomy === 'revoke'
          ? { role: 'assistant', content: 'OK, I will ask before I change anything again.' }
          : autoApply
            ? { role: 'assistant', content: 'Apply without asking is already on. Say “ask me first” to turn it off.' }
            : { role: 'assistant', content: AUTONOMY_WARNING, autonomy_prompt: 'pending' }
      if (autonomy === 'revoke') setAutonomy(false)
      setMessages((current) => [...current, reply])
      if (!asksForMoreThanPermission(userMsg)) return
    }

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

    // "/mcp" on its own: what the assistant's tools are and what they take.
    if (/^\/mcp(?:\s+(?:tools|help))?$/i.test(userMsg)) {
      try {
        const { tools } = await api.mcp.listTools()
        const lines = tools.map((tool) => `• ${tool.name} (${tool.effect}): ${tool.description}\n   ${tool.params}`)
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: `Tools (call one with /mcp <name> key=value …; changes always come back as a card to apply):\n${lines.join('\n')}` },
        ])
      } catch (error) {
        setMessages((current) => [...current, { role: 'assistant', content: `I couldn't list the tools: ${error instanceof Error ? error.message : 'unknown error'}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    const mcpCommand = parseMcpCommand(userMsg)
    if (mcpCommand) {
      try {
        const toolArgs: Record<string, unknown> = Object.fromEntries(
          Object.entries(mcpCommand.args).map(([key, value]) => [key, mcpArgValue(key, value)])
        )

        if (mcpCommand.tool === 'getDocumentContent' && documentId) {
          toolArgs.documentId = documentId
        }

        if ((mcpCommand.tool === 'getBehaviorSummary' || mcpCommand.tool === 'applyUsualFormatting') && documentId) {
          toolArgs.documentId = documentId
        }

        if (mcpCommand.tool === 'predictNextFormat') {
          toolArgs.text = documentContent
        }

        if (mcpCommand.tool === 'applyFormatting') {
          if (documentId) toolArgs.documentId = documentId
          if (!toolArgs.mode) toolArgs.mode = 'preview'
        }

        // The writing-assist tools work on the selection unless the command gives the text.
        if (mcpCommand.tool === 'structureUserSection') {
          toolArgs.userNotes ??= selectionText
          toolArgs.sectionTitle ??= 'New section'
        }
        if (mcpCommand.tool === 'searchLiteratureAndCite') {
          toolArgs.query ??= selectionText
          toolArgs.style ??= writingAssist?.citationStyleLabel.toLowerCase().startsWith('ieee') ? 'ieee' : 'apa'
        }
        if (mcpCommand.tool === 'refineAcademicStyle') toolArgs.text ??= selectionText

        const result = await api.mcp.callTool<unknown>(mcpCommand.tool as never, toolArgs)
        // A plan tool's card is shown exactly like a chat reply: the same preview, the same Apply.
        const toolCard = isRecord(result) && isRecord(result.card) && typeof result.card.reply === 'string' ? result.card : null
        if (toolCard) {
          showResponse({ provider: 'mcp', model: mcpCommand.tool, ...(toolCard as unknown as Omit<AIChatResponse, 'provider' | 'model'>) }, { range: selectionRange, text: selectionText })
          return
        }
        // Their results become the same confirm-first cards as in chat, never a direct edit.
        const assist = mcpWritingAssist(mcpCommand.tool, result)
        if (assist) {
          setMessages((current) => [...current, writingAssistMessage(assist.reply, assist, { range: selectionRange, text: selectionText })])
          return
        }
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
        lastPreviewRef.current,
        selectionText
      )

      showResponse(response, { range: selectionRange, text: selectionText })
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
                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
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
                    {m.clarify && (
                      <ClarifyCard clarify={m.clarify} choice={m.clarify_choice ?? null} onPick={(option) => pickClarifyOption(i, m, option)} />
                    )}
                    {m.routed_by_ai && (m.preview_status || m.automation || m.auto_captions || m.clarify) && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                        Understood with AI · check the change before applying it
                      </div>
                    )}
                    {m.automation && (
                      <AutomationCard
                        automation={m.automation}
                        lines={m.automation_lines ?? []}
                        status={m.assist_status ?? 'pending'}
                        result={m.automation_result ?? null}
                        available={m.automation.action === 'renumberCaptions' || Boolean(automations)}
                        onApply={() => m.automation && runAutomation(i, m.automation, m.automation_lines ?? [])}
                        onDismiss={() => dismissCard(i, m)}
                      />
                    )}
                    {m.auto_captions && (
                      <AutoCaptionCard
                        items={m.auto_captions}
                        status={m.assist_status ?? 'pending'}
                        untitled={m.captions_untitled ?? null}
                        onApply={() => addAutoCaptions(i, m.caption_kinds ?? ['figure', 'table'])}
                        onDismiss={() => dismissCard(i, m)}
                        onNextUntitled={goToNextUntitledCaption}
                      />
                    )}
                    {m.structured && (
                      <StructureCard
                        section={m.structured}
                        status={m.assist_status ?? 'pending'}
                        onInsert={() => m.structured && insertStructured(i, m.structured)}
                        onDismiss={() => patchMessage(i, { assist_status: 'dismissed' })}
                      />
                    )}
                    {m.papers && m.papers.length > 0 && (
                      <CitationsCard
                        papers={m.papers}
                        status={writingAssist ? (m.assist_status ?? 'pending') : 'dismissed'}
                        styleLabel={writingAssist?.citationStyleLabel ?? 'citations'}
                        onCite={(papers) => citePapers(i, m, papers)}
                        onDismiss={() => patchMessage(i, { assist_status: 'dismissed' })}
                      />
                    )}
                    {m.refinement && (
                      <RefineCard
                        refinement={m.refinement}
                        statuses={m.edit_statuses ?? m.refinement.edits.map((): EditStatus => 'pending')}
                        onApply={(index) => applyRevisions(i, m, [index])}
                        onDismiss={(index) =>
                          patchMessage(i, {
                            edit_statuses: (m.edit_statuses ?? []).map((status, k) => (k === index ? 'dismissed' : status)),
                          })
                        }
                        onApplyAll={() =>
                          applyRevisions(
                            i,
                            m,
                            (m.edit_statuses ?? []).flatMap((status, k) => (status === 'pending' ? [k] : []))
                          )
                        }
                      />
                    )}
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
                              // A change that matches nothing in this document has nothing to apply.
                              disabled={m.preview_block_count === 0}
                              title={m.preview_block_count === 0 ? 'Nothing in this document matches this change' : undefined}
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
                                cursor: m.preview_block_count === 0 ? 'not-allowed' : 'pointer',
                                opacity: m.preview_block_count === 0 ? 0.5 : 1,
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
                    {m.autonomy_prompt === 'pending' && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                        <button
                          type="button"
                          onClick={() => answerAutonomyPrompt(i, true)}
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
                          Turn on
                        </button>
                        <button
                          type="button"
                          onClick={() => answerAutonomyPrompt(i, false)}
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
                          Keep asking
                        </button>
                      </div>
                    )}
                    {m.autonomy_prompt === 'accepted' && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.7 }}>Turned on</div>
                    )}
                    {m.autonomy_prompt === 'declined' && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.7 }}>Kept asking</div>
                    )}
                    {m.command_applied && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: 'var(--success)' }}>✓</span> {m.auto_applied ? 'Applied without asking' : 'Applied'}: {m.command_applied}
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

            {autoApply && (
              <div
                role="status"
                style={{
                  borderTop: '1px solid var(--border)',
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  backgroundColor: 'color-mix(in srgb, var(--warning, #d97706) 12%, transparent)',
                  color: 'var(--foreground)',
                }}
              >
                <span>Applying changes without asking. Check them: I may get formatting wrong.</span>
                <button
                  type="button"
                  onClick={() => setAutonomy(false)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  Turn off
                </button>
              </div>
            )}

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <textarea
                value={input}
                rows={Math.min(Math.max(input.split('\n').length, 1), 6)}
                onChange={(e) => setInput(e.target.value)}
                // Enter sends; Shift+Enter starts a new line, so pasted notes keep their bullets.
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                placeholder="Ask for writing or formatting help..."
                aria-label="Message the assistant"
                style={{
                  flex: 1,
                  resize: 'none',
                  lineHeight: 1.4,
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
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--ring)';
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent)';
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => void send()}
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
