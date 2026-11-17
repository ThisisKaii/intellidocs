import { buildFormattingReply } from './buildFormattingReply'
import { hasStyleChange, type FormattingIntent, type StyleChange, type TargetCategory, type TargetMode } from './parseFormattingIntent'
import type { CaptionKind } from './detectCaptionRequest'

/**
 * Assistant cards: what the chat shows for a change it can make, in the same shape as an
 * /ai/chat reply, so a chat request, an MCP tool call and (later) an AI-chosen action all
 * render as the same confirm-first card. A card never changes the document by itself.
 */

/** Display names of the academic presets. */
export const PRESET_NAMES: Record<string, string> = {
  apa_7th: 'APA 7th Edition',
  ieee: 'IEEE Conference',
  uclm_capstone: 'UCLM Capstone (Thesis)',
}

export type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

/** Which of the automatic formatting suggestions to apply. */
export type SuggestionGroup = 'all' | 'figures' | 'captions' | 'blankLines' | 'headings'

/** Automations the editor runs itself; the card says what will happen, the editor works out where. */
export type Automation =
  | { action: 'renumberCaptions' }
  | { action: 'fixSuggestions'; only: SuggestionGroup }
  | { action: 'pageSetup'; pageSize?: PageSizeKey; orientation?: 'portrait' | 'landscape'; margins?: Partial<PageMargins> }
  | { action: 'bibliography' }

/** A formatting preview the editor applies on confirmation (the chat's preview card). */
export interface FormattingPreviewPayload {
  format: string
  label: string
  confidence: number
  reason: string
  formats: string[]
  scope: 'selection' | 'all'
  fontSize?: number | null
  target?: string | null
  targetMode?: TargetMode | null
  targetCategory?: TargetCategory | null
  normalize?: boolean
  style?: StyleChange | null
  presetKey?: string | null
  genre?: string
  learned?: unknown[]
}

export interface AssistantCard {
  reply: string
  mode: 'chat' | 'preview' | 'captions' | 'automation'
  preview?: FormattingPreviewPayload | null
  captionKinds?: CaptionKind[]
  automation?: Automation
}

/** A plain answer with nothing to apply. */
export function answerCard(reply: string): AssistantCard {
  return { reply, mode: 'chat', preview: null }
}

/** "Format in APA style": the preset's page setup, body text and heading styles. */
export function presetCard(presetKey: string): AssistantCard {
  const name = PRESET_NAMES[presetKey] ?? presetKey
  return {
    reply: `I can format this document with the ${name} preset: its margins, body text and heading styles. Press Apply to switch to it, or Reject to keep the current setup.`,
    mode: 'preview',
    preview: {
      format: 'preset',
      label: `${name} preset`,
      confidence: 0.9,
      reason: `Applies the ${name} preset: its page setup, body text and heading styles.`,
      formats: [],
      scope: 'all',
      presetKey,
    },
  }
}

const FORMAT_LABELS: Record<string, string> = {
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

/** One formatting change, described by its parts instead of a sentence. */
export interface FormattingChange {
  formats: FormattingIntent[]
  fontSize: number | null
  normalize: boolean
  scope: 'selection' | 'all'
  target: string | null
  targetMode: TargetMode | null
  targetCategory: TargetCategory
  style: StyleChange
}

/** True when the change would do something. */
export function changeDoesSomething(change: FormattingChange): boolean {
  return change.formats.length > 0 || change.fontSize !== null || change.normalize || hasStyleChange(change.style)
}

/** A formatting change as the chat's preview card, with the same reply a typed request gets. */
export function formattingCard(change: FormattingChange): AssistantCard {
  const primary = change.formats[0]
  const label = change.normalize
    ? 'Clear formatting'
    : primary
      ? (FORMAT_LABELS[primary] ?? primary)
      : hasStyleChange({ ...change.style, fontSizeStep: null }) ? 'Text style' : 'Font size'
  const reply = buildFormattingReply(
    {
      formats: change.formats,
      fontSize: change.fontSize,
      normalize: change.normalize,
      scope: change.scope,
      target: change.target,
      targetMode: change.targetMode,
      targetCategory: change.targetCategory,
      style: change.style,
    },
    JSON.stringify(change)
  )
  return {
    reply,
    mode: 'preview',
    preview: {
      format: primary ?? 'body_text',
      label,
      confidence: 0.9,
      reason: reply,
      formats: change.formats,
      scope: change.scope,
      fontSize: change.fontSize,
      target: change.target,
      targetMode: change.targetMode,
      targetCategory: change.targetCategory,
      normalize: change.normalize,
      style: change.normalize ? null : change.style,
    },
  }
}

/** "Auto caption": the editor lists every figure / table without a caption. */
export function captionsCard(kinds: CaptionKind[]): AssistantCard {
  const what = kinds.length === 2 ? 'figure and table' : kinds[0]
  return {
    reply: `I’ll look for every ${what} without a caption. Titles come only from your own words already in the document (a picture’s alt text, a table’s title row); the rest are left blank for you to write.`,
    mode: 'captions',
    captionKinds: kinds,
    preview: null,
  }
}

const AUTOMATION_REPLIES: Record<Automation['action'], string> = {
  renumberCaptions: 'I can renumber every figure and table caption in document order. Check the list below, then apply.',
  fixSuggestions: 'Here are the formatting fixes IntelliDocs found in this document. Check them, then apply them in one go.',
  pageSetup: 'I can change the page setup as below. Nothing changes until you apply it.',
  bibliography: 'I can write the reference list from the sources cited in this document, in its citation style.',
}

/** An automation the editor runs on confirmation. */
export function automationCard(automation: Automation): AssistantCard {
  return { reply: AUTOMATION_REPLIES[automation.action], mode: 'automation', automation, preview: null }
}
