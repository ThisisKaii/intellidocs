import type { ToneFocus } from './refineAcademicTone'

/** A writing-assist request the chat should hand to one of the Batch E agents. */
export type WritingTask =
  | { kind: 'structure'; sectionTitle: string; notes: string }
  | { kind: 'citations'; query: string | null; limit: number }
  | { kind: 'refine'; text: string | null; focus: ToneFocus }
  | { kind: 'decline' }

/** "Write an essay / a chapter / the introduction on X": a request to author content from a topic. */
export const TOPIC_REQUEST =
  /^\s*(?:please\s+|can you\s+|could you\s+)?(?:write|generate|compose|produce|draft)\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|my\s+|our\s+|some\s+)?(?:[\w-]+\s+){0,4}?(?:essay|paper|section|chapter|article|introduction|report|thesis|paragraphs?|abstract|conclusion|literature review|discussion|methodology)\b/i

const STRUCTURE = /\b(?:organi[sz]e|structure|arrange|turn|convert|shape|write(?: up)?|draft|use)\b[^:\n]{0,120}\b(?:notes?|points|bullets|bullet points|rough draft|outline)\b/i
const CITATIONS = /\b(?:find|search(?: for)?|look up|get|suggest|recommend|give me)\b[^:\n]{0,40}\b(?:papers?|citations?|sources?|references?|literature|studies|articles|publications)\b/i
const REFINE = /\b(?:refine|polish)\b|\bmore (?:academic|formal|scholarly)\b|\b(?:academic|formal|scholarly) (?:tone|style|register)\b|\bhedg(?:e|ing)\b/i
const SELECTION_WORDS = /^(?:it|this|that|these|this claim|my claim|the claim|this text|the selected text|the selection|selected text|my selection|this paragraph|the paragraph|this sentence)$/i
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 }
const MIN_INLINE_WORDS = 20

function splitAtColon(message: string): { head: string; body: string } {
  const colon = message.indexOf(':')
  const newline = message.indexOf('\n')
  const cut = colon === -1 ? newline : newline === -1 ? colon : Math.min(colon, newline)
  if (cut === -1) return { head: message, body: '' }
  return { head: message.slice(0, cut), body: message.slice(cut + 1).trim() }
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function titleCase(text: string): string {
  return text.replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
}

/** The section the notes are for: "for section 1.2", "for the Introduction", "my methodology notes". */
function sectionTitleOf(head: string): string {
  const forMatch = /\bfor\s+(?:the\s+|my\s+|our\s+|a\s+)?(.+?)(?:\s+(?:into|as|in|using)\b.*)?$/i.exec(head)
  const myMatch = /\bmy\s+(.+?)\s+(?:notes?|points|bullets|bullet points|rough draft|outline)\b/i.exec(head)
  const fromMatch = /\b(?:write|draft)\s+(?:up\s+)?(?:the\s+|an?\s+|my\s+)?(.+?)\s+(?:from|using|with|out of)\s+(?:my|our|these|the)\b/i.exec(head)
  const raw = (forMatch?.[1] ?? fromMatch?.[1] ?? myMatch?.[1] ?? '').replace(/\b(?:formal|academic)\b/gi, '').replace(/\s+section$/i, '').replace(/\s+/g, ' ').trim()
  if (!raw || /^(?:notes?|points|me|it|this)$/i.test(raw)) return 'New section'
  return titleCase(raw)
}

function citationLimit(message: string): number {
  const match = /\b(\d|one|two|three|four|five|a|an)\s+(?:(?:recent|good|relevant|real|peer-reviewed|academic|scholarly)\s+)*(?:papers?|citations?|sources?|references?|studies|articles|publications)\b/i.exec(message)
  const value = match ? (NUMBER_WORDS[match[1].toLowerCase()] ?? Number(match[1])) : 3
  return Math.min(Math.max(value || 3, 1), 5)
}

function citationQuery(message: string, selectionText: string): string | null {
  const match = /\b(?:for|on|about|supporting|that supports?|to support|related to|regarding|backing)\s+(.+)$/i.exec(message)
  const query = (match?.[1] ?? '')
    .replace(/\s+(?:and|then)\s+(?:add|insert|cite)\b.*$/i, '')
    .replace(/[.?!]+$/, '')
    .replace(/^["“]|["”]$/g, '')
    .trim()
  if (query && !SELECTION_WORDS.test(query)) return query
  return selectionText.trim() || null
}

function toneFocus(message: string): ToneFocus {
  if (/\bhedg|overclaim|claims?\b/i.test(message)) return 'hedging'
  if (/\bvocabular|word choice|informal words|contractions?\b/i.test(message)) return 'vocabulary'
  if (/\bclarity|concise|filler|wordy|transitions?\b/i.test(message)) return 'clarity'
  return 'all'
}

/**
 * Recognise the three writing-assist requests (organise notes into a section,
 * find citations, refine tone), and topic-only authoring requests that are
 * declined. Deterministic, like the formatting intent parser, so routing never
 * depends on a model. Returns null for everything else.
 */
export function detectWritingTask(message: string, selectionText = ''): WritingTask | null {
  const { head, body } = splitAtColon(message)

  if (STRUCTURE.test(head)) {
    const notes = body || (wordCount(selectionText) >= MIN_INLINE_WORDS ? selectionText : '')
    return { kind: 'structure', sectionTitle: sectionTitleOf(head), notes }
  }
  if (CITATIONS.test(head)) {
    return { kind: 'citations', query: citationQuery(message, selectionText), limit: citationLimit(message) }
  }
  if (REFINE.test(head)) {
    const text = wordCount(body) >= 3 ? body : selectionText.trim() || null
    return { kind: 'refine', text, focus: toneFocus(head) }
  }
  if (TOPIC_REQUEST.test(message) && wordCount(body) < MIN_INLINE_WORDS) {
    return { kind: 'decline' }
  }
  return null
}
