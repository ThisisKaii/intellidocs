/**
 * Which blocks of an IEEE paper run across both columns.
 *
 * An IEEE paper sets a wide table, figure or equation across the full page width. The author marks
 * the element (`data-span="full"`), and its caption goes with it: a table's caption sits above it
 * and a figure's below it. The preview, the draft view and the Word export all use this one rule.
 */

export type CaptionKind = 'figure' | 'table'

/** What the rule needs to know about one block, whatever it is made of (DOM element or editor node). */
export interface SpanItem {
  /** The author marked this block as full width. */
  span: boolean
  /** The block is a figure or table caption, or null for anything else. */
  caption: CaptionKind | null
}

/**
 * For every block, whether it runs across both columns: the marked blocks, plus the table caption
 * directly above a marked block and the figure caption directly below one.
 */
export function spanFlags(items: readonly SpanItem[]): boolean[] {
  const flags = items.map((item) => item.span)
  items.forEach((item, index) => {
    if (!item.span) return
    if (index > 0 && items[index - 1].caption === 'table') flags[index - 1] = true
    if (index + 1 < items.length && items[index + 1].caption === 'figure') flags[index + 1] = true
  })
  return flags
}

/** "TABLE I. ..." or "Fig. 2. ...": the label a caption starts with. */
const TABLE_LABEL = /^\s*table\s+[ivxlcdm\d]+\b/i
const FIGURE_LABEL = /^\s*fig(?:ure|\.)?\s*\d+/i

/** The caption kind of a paragraph: its stored kind, else what its label says. */
function captionOf(el: Element): CaptionKind | null {
  const stored = el.getAttribute('data-caption-kind')
  if (stored === 'figure' || stored === 'table') return stored
  if (el.tagName !== 'P') return null
  const text = el.textContent ?? ''
  if (TABLE_LABEL.test(text)) return 'table'
  if (FIGURE_LABEL.test(text)) return 'figure'
  return null
}

/** True when the element, or the element it wraps (a figure around an image), is marked full width. */
export function isMarkedFullSpan(el: Element): boolean {
  return el.getAttribute('data-span') === 'full' || el.querySelector(':scope > [data-span="full"]') !== null
}

/** A run of consecutive blocks that share one layout: two columns, or full width. */
export interface SpanGroup {
  elements: Element[]
  full: boolean
}

/** Splits a paper's body blocks into runs of two-column and full-width blocks, in document order. */
export function groupBySpan(elements: readonly Element[]): SpanGroup[] {
  const flags = spanFlags(elements.map((el) => ({ span: isMarkedFullSpan(el), caption: captionOf(el) })))
  const groups: SpanGroup[] = []
  elements.forEach((el, index) => {
    const last = groups[groups.length - 1]
    if (last && last.full === flags[index]) last.elements.push(el)
    else groups.push({ elements: [el], full: flags[index] })
  })
  return groups
}
