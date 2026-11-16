/**
 * Recognising where a manuscript's chapters and back matter start, on the editor's JSON.
 *
 * One rule for the whole app (the document tabs split uses it; older call sites —
 * chatFormatting.isChapterHeading, captionNumbering.chapterNumber, pageLayout.FIRST_CHAPTER — are to
 * move onto it). A chapter opens with a short top-level line "CHAPTER 1", "Chapter I", "CHAPTER ONE"
 * (optionally followed by its title: "CHAPTER I: INTRODUCTION"). Table-of-contents entries look the
 * same but end in a page number or hold a tab, so they never count.
 */

export interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  content?: JsonNode[]
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
}
const CHAPTER_LINE = /^chapter\s+(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b\s*[:.\-–—]?\s*(.*)$/i
/** Back matter that follows the last chapter, each its own tab. */
const BACK_MATTER = /^(references|bibliography|works cited|literature cited|appendix|appendices|curriculum vitae)\b/i
/** Longest line that can open a chapter or the back matter. */
const MAX_LABEL_CHARS = 80

function romanValue(text: string): number {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }
  let total = 0
  const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i += 1) {
    const value = values[lower[i]] ?? 0
    const next = values[lower[i + 1]] ?? 0
    total += value < next ? -value : value
  }
  return total
}

/** The visible text of a node. */
export function nodeText(node: JsonNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(nodeText).join('')
}

function hasTab(node: JsonNode): boolean {
  return (node.content ?? []).some((child) => child.type === 'tab' || hasTab(child))
}

function isTextBlock(node: JsonNode): boolean {
  return node.type === 'paragraph' || node.type === 'heading'
}

/** A line short enough to be a label, and not a contents entry (no tab, no trailing page number). */
function labelText(node: JsonNode): string | null {
  if (!isTextBlock(node) || hasTab(node)) return null
  const text = nodeText(node).replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_LABEL_CHARS) return null
  return text
}

/** The chapter a top-level block opens ({number, title after the number}), or null. */
export function chapterOpening(node: JsonNode): { number: number; title: string } | null {
  const text = labelText(node)
  if (!text) return null
  const match = CHAPTER_LINE.exec(text)
  if (!match) return null
  const rest = match[2].trim()
  // "CHAPTER I: INTRODUCTION 1" is a contents line (its page number at the end).
  if (/\d\s*$/.test(rest)) return null
  const raw = match[1].toLowerCase()
  const number = /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw] ?? romanValue(raw)
  return number > 0 ? { number, title: rest } : null
}

/** The back-matter section a top-level block opens ("References", "Appendices"…), or null. */
export function backMatterOpening(node: JsonNode): string | null {
  const text = labelText(node)
  if (!text || /\d\s*$/.test(text)) return null
  const match = BACK_MATTER.exec(text)
  return match ? text : null
}

/** "REVIEW OF RELATED LITERATURE AND STUDIES" → "Review of Related Literature and Studies". */
export function titleCase(text: string): string {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
  if (text !== text.toUpperCase()) return text
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => (index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
