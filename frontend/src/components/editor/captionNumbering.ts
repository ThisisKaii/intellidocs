import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import { toRoman } from './ieeeNumbering'

/**
 * Figure and table caption numbering that knows the document's own captions.
 *
 * Captions inserted in the editor are tagged (`captionKind`); captions that came with an imported
 * file are plain paragraphs reading "Figure 3: Comet" or "Table 2. Results". Both count: a new
 * caption is numbered after the ones above it, and a caption whose number does not follow from
 * its place ("Figure 4" after another "Figure 4") is found here so the checker can offer to fix it.
 *
 * The document's own scheme decides what "right" means: one sequence (Figure 1, 2, 3 …),
 * chapter numbers (Figure 2.1, 2.2, 3.1 …) or numbers that start again at 1 in each chapter.
 */

export type CaptionKind = 'figure' | 'table'

/** How caption labels read: "Figure 1" / "Table 1", or IEEE's "Fig. 1" / "TABLE I". */
export type CaptionLabelStyle = 'default' | 'ieee'

/** Numbering schemes a document can use for one kind of caption. */
export type CaptionScheme = 'sequence' | 'chapter' | 'restart'

/** The label at the start of a caption: word, space, number (Arabic, chapter.number or Roman). */
export const CAPTION_LABEL = /^(Figure|Fig\.|Table|TABLE)(\s+)(\d+(?:\.\d+)?|[IVXLCDM]+)(?![A-Za-z0-9])/

/** What may follow the number of an untagged caption: a separator, or nothing at all. */
const PLAIN_SEPARATOR = /^\s*(?:[.:–—-]|$)/
/** A list-of-figures entry ("Figure 1. Framework ........ 23"): never a caption. */
const LIST_ENTRY = /(?:\.{3,}|…|\t)\s*[ivxlcdm\d]+\s*$/i
/** Longest text an untagged caption has; longer paragraphs are prose that starts "Figure 3 …". */
const MAX_PLAIN_CAPTION = 200
const CHAPTER = /^chapter\s+([0-9]+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

export interface CaptionEntry {
  /** Position of the caption's block. */
  pos: number
  node: ProseMirrorNode
  kind: CaptionKind
  /** Tagged by the editor (`captionKind`), as opposed to recognised from its text. */
  tagged: boolean
  /** The whole label ("Figure 4"), its word ("Figure"), the space after it and the number text. */
  label: string
  word: string
  space: string
  number: string
  /** Chapter in force where the caption sits (from the last "Chapter N" heading), if any. */
  chapter: number | null
}

/** A caption whose number does not follow from its place, and the label it should have. */
export interface CaptionFix {
  entry: CaptionEntry
  expected: string
}

function romanValue(text: string): number {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
  let total = 0
  const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i += 1) {
    const value = values[lower[i]] ?? 0
    const next = values[lower[i + 1]] ?? 0
    total += value < next ? -value : value
  }
  return total
}

/** The chapter a "Chapter 2" / "CHAPTER II" / "Chapter Two" line opens, or null. */
export function chapterNumber(text: string): number | null {
  const match = CHAPTER.exec(text.trim())
  if (!match) return null
  const value = match[1].toLowerCase()
  if (/^\d+$/.test(value)) return Number(value)
  if (WORD_NUMBERS[value]) return WORD_NUMBERS[value]
  const roman = romanValue(value)
  return roman > 0 ? roman : null
}

function kindOfWord(word: string): CaptionKind {
  return word.toLowerCase().startsWith('fig') ? 'figure' : 'table'
}

/** Whether an inline node is a tab (imported documents keep tabs as their own inline node). */
function hasTab(node: ProseMirrorNode): boolean {
  let found = false
  node.forEach((child) => {
    if (!child.isText && /tab/i.test(child.type.name)) found = true
  })
  return found
}

/** Read one block as a caption, or null. */
function readCaption(node: ProseMirrorNode, pos: number, chapter: number | null): CaptionEntry | null {
  if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return null
  const tagKind = node.attrs.captionKind as CaptionKind | null | undefined
  const text = node.textContent
  const match = CAPTION_LABEL.exec(text)
  if (!match) return null
  const kind = kindOfWord(match[1])
  const tagged = tagKind === 'figure' || tagKind === 'table'
  if (tagged && tagKind !== kind) return null
  if (!tagged) {
    if (node.attrs.generated) return null
    if (text.length > MAX_PLAIN_CAPTION || LIST_ENTRY.test(text) || hasTab(node)) return null
    if (!PLAIN_SEPARATOR.test(text.slice(match[0].length))) return null
    // Roman numbers belong to IEEE tables ("TABLE IV"); "Figure I" is not a caption number.
    if (/^[IVXLCDM]+$/.test(match[3]) && match[1] !== 'TABLE') return null
  }
  return { pos, node, kind, tagged, label: match[0], word: match[1], space: match[2], number: match[3], chapter }
}

/**
 * Every caption in document order. Tables are skipped (a list of figures is often a table whose
 * rows read exactly like captions); a tagged caption is always included.
 */
export function findCaptions(doc: ProseMirrorNode): CaptionEntry[] {
  const entries: CaptionEntry[] = []
  let chapter: number | null = null
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') return false
    if (!node.isTextblock) return true
    const opened = chapterNumber(node.textContent)
    if (opened !== null && (node.type.name === 'heading' || node.textContent.trim().length <= 40)) chapter = opened
    const entry = readCaption(node, pos, chapter)
    if (entry) entries.push(entry)
    return false
  })
  return entries
}

/** Count of captions of each kind (cheap, for noticing that one was added or removed). */
export function captionCounts(entries: CaptionEntry[]): Record<CaptionKind, number> {
  const counts: Record<CaptionKind, number> = { figure: 0, table: 0 }
  for (const entry of entries) counts[entry.kind] += 1
  return counts
}

/** The scheme one kind of caption uses in this document. */
export function captionScheme(entries: CaptionEntry[]): CaptionScheme {
  if (entries.length === 0) return 'sequence'
  const dotted = entries.filter((entry) => entry.number.includes('.')).length
  if (dotted * 2 >= entries.length) return 'chapter'
  const ones = entries.filter((entry) => entry.number === '1').length
  return ones >= 2 ? 'restart' : 'sequence'
}

/**
 * Where the open part of a document split into tabs stands: how many figures and tables the tabs
 * before it hold, and the numbering scheme of the whole document (one tab cannot tell a sequence
 * from numbers that restart in each chapter). Absent for a document without tabs.
 */
export interface CaptionContext {
  offsets: Record<CaptionKind, number>
  schemes?: Partial<Record<CaptionKind, CaptionScheme>>
}

/**
 * The label every caption should have, in document order.
 *
 * Tagged captions take the label style's word ("Figure" / "Fig." / "TABLE"); captions that came
 * with the document keep their own word and spacing, only their number changes.
 */
export function expectedLabels(entries: CaptionEntry[], style: CaptionLabelStyle, context: CaptionContext | null = null): Map<CaptionEntry, string> {
  const result = new Map<CaptionEntry, string>()
  for (const kind of ['figure', 'table'] as const) {
    const ofKind = entries.filter((entry) => entry.kind === kind)
    const scheme = context?.schemes?.[kind] ?? captionScheme(ofKind)
    // One sequence through the whole document: a tab continues after the tabs before it.
    let count = scheme === 'sequence' ? context?.offsets[kind] ?? 0 : 0
    let lastChapter: number | null = null
    for (const entry of ofKind) {
      let number: string
      if (scheme === 'sequence') {
        count += 1
        number = String(count)
      } else {
        const own = Number(entry.number.split('.')[0])
        const chapter: number = entry.chapter ?? lastChapter ?? (Number.isFinite(own) && own > 0 ? own : 1)
        if (chapter !== lastChapter) count = 0
        lastChapter = chapter
        count += 1
        number = scheme === 'chapter' ? `${chapter}.${count}` : String(count)
      }
      if (entry.tagged) {
        result.set(entry, scheme === 'sequence' ? captionLabel(kind, count, style) : `${captionLabel(kind, 1, style).split(/\s/)[0]} ${number}`)
      } else {
        const ieeeTable = /^[IVXLCDM]+$/.test(entry.number) && scheme === 'sequence'
        result.set(entry, `${entry.word}${entry.space}${ieeeTable ? toRoman(count) : number}`)
      }
    }
  }
  return result
}

/** Captions whose label is not what their place in the document gives them. */
export function misnumberedCaptions(
  entries: CaptionEntry[],
  style: CaptionLabelStyle,
  onlyPlain = false,
  context: CaptionContext | null = null,
): CaptionFix[] {
  const expected = expectedLabels(entries, style, context)
  const fixes: CaptionFix[] = []
  for (const entry of entries) {
    if (onlyPlain && entry.tagged) continue
    const label = expected.get(entry)
    if (label && label !== entry.label) fixes.push({ entry, expected: label })
  }
  return fixes
}

/** The label text for caption number `number` of a kind, in the given style (without a trailing period). */
export function captionLabel(kind: CaptionKind, number: number, style: CaptionLabelStyle): string {
  if (style === 'ieee') {
    return kind === 'figure' ? `Fig. ${number}` : `TABLE ${toRoman(number)}`
  }
  return kind === 'figure' ? `Figure ${number}` : `Table ${number}`
}

/** The label a new caption of `kind` inserted at `pos` gets, following the captions around it. */
export function labelForNewCaption(
  doc: ProseMirrorNode,
  kind: CaptionKind,
  pos: number,
  style: CaptionLabelStyle,
  context: CaptionContext | null = null,
): string {
  const entries = findCaptions(doc).filter((entry) => entry.kind === kind)
  const before = entries.filter((entry) => entry.pos < pos)
  const scheme = context?.schemes?.[kind] ?? captionScheme(entries)
  if (scheme === 'sequence' || before.length === 0) {
    if (scheme === 'chapter') {
      // First caption of its kind in a chapter-numbered document: chapter of the place, number 1.
      let chapter = 1
      doc.nodesBetween(0, pos, (node) => {
        if (node.isTextblock) {
          const opened = chapterNumber(node.textContent)
          if (opened !== null) chapter = opened
          return false
        }
        return node.type.name !== 'table'
      })
      return `${captionLabel(kind, 1, style).split(/\s/)[0]} ${chapter}.1`
    }
    return captionLabel(kind, before.length + 1 + (scheme === 'sequence' ? context?.offsets[kind] ?? 0 : 0), style)
  }
  // Number it as if it were already there, then read off its label.
  const previous = before[before.length - 1]
  let chapter = previous.chapter
  doc.nodesBetween(previous.pos, pos, (node) => {
    if (node.isTextblock) {
      const opened = chapterNumber(node.textContent)
      if (opened !== null && (node.type.name === 'heading' || node.textContent.trim().length <= 40)) chapter = opened
      return false
    }
    return node.type.name !== 'table'
  })
  const expected = expectedLabels(entries, style, context)
  const previousNumber = (expected.get(previous) ?? previous.label).split(/\s+/).pop() ?? '1'
  const [major, minor] = previousNumber.includes('.') ? previousNumber.split('.').map(Number) : [null, Number(previousNumber)]
  const word = captionLabel(kind, 1, style).split(/\s/)[0]
  const sameChapter = chapter === null || chapter === previous.chapter
  if (scheme === 'chapter') {
    return sameChapter ? `${word} ${major ?? chapter ?? 1}.${(minor || 0) + 1}` : `${word} ${chapter}.1`
  }
  return sameChapter ? `${word} ${(minor || 0) + 1}` : `${word} 1`
}
