/**
 * Plain, action-first wording for formatting suggestions ("Inconsistent
 * formatting: Remove bold & italic") instead of "Body text is bold, italic —
 * match the rest of the document?". Pure, so the scanner and tests share it.
 */

/** The properties a suggested fix can set, in body (BodyBaseline) or short-line (LineStyle) form. */
export interface SuggestedFix {
  bold?: boolean
  italic?: boolean
  /** Size on the text itself (pt); null means "use the usual inherited size". */
  fontSize?: number | null
  /** Size a line renders at (pt), from the short-line sweep. */
  sizePt?: number | null
  /** Size the body renders at (pt), from the body sweep. */
  effectiveSizePt?: number | null
  textAlign?: string
  lineHeight?: number | null
  /** First-line indent (pt). */
  firstIndentPt?: number | null
  /** Space above the paragraph (pt). */
  spaceBeforePt?: number | null
}

/** Words for an alignment value. */
const ALIGN_WORDS: Record<string, string> = { left: 'align left', center: 'center', right: 'align right', justify: 'justify' }

/** "0.5in" from points. */
function inches(pt: number): string {
  return `${Math.round((pt / 72) * 100) / 100}in`
}

/** Bold and italic as one phrase: "remove bold & italic", "make bold & remove italic". */
function emphasisPhrase(fix: SuggestedFix): string | null {
  const remove = [fix.bold === false ? 'bold' : null, fix.italic === false ? 'italic' : null].filter(Boolean) as string[]
  const add = [fix.bold === true ? 'bold' : null, fix.italic === true ? 'italic' : null].filter(Boolean) as string[]
  const parts: string[] = []
  if (add.length > 0) parts.push(`make ${add.join(' & ')}`)
  if (remove.length > 0) parts.push(`remove ${remove.join(' & ')}`)
  return parts.length > 0 ? parts.join(' & ') : null
}

/**
 * The change a fix makes, as short imperative phrases, most visible first:
 * ["remove bold & italic", "center", "double-space"].
 */
export function fixPhrases(fix: SuggestedFix): string[] {
  const phrases: string[] = []
  const emphasis = emphasisPhrase(fix)
  if (emphasis) phrases.push(emphasis)
  const size = fix.fontSize ?? fix.sizePt ?? fix.effectiveSizePt
  if (typeof size === 'number') phrases.push(`set text to ${size}pt`)
  else if (fix.fontSize === null && 'fontSize' in fix) phrases.push('use the usual text size')
  if (fix.textAlign && ALIGN_WORDS[fix.textAlign]) phrases.push(ALIGN_WORDS[fix.textAlign])
  if (typeof fix.lineHeight === 'number') {
    phrases.push(fix.lineHeight === 2 ? 'double-space' : fix.lineHeight === 1 ? 'single-space' : `set line spacing to ${fix.lineHeight}`)
  }
  if (typeof fix.firstIndentPt === 'number') {
    phrases.push(fix.firstIndentPt === 0 ? 'remove the first-line indent' : `add a ${inches(fix.firstIndentPt)} first-line indent`)
  }
  if (typeof fix.spaceBeforePt === 'number') phrases.push('even out the space above')
  return phrases
}

/** Phrases joined for a label, capitalized: "Remove bold & italic, center". At most three, then "+N more". */
export function describeFix(fix: SuggestedFix): string {
  const phrases = fixPhrases(fix)
  if (phrases.length === 0) return 'Match the surrounding formatting'
  const shown = phrases.slice(0, 3).join(', ')
  const more = phrases.length > 3 ? ` +${phrases.length - 3} more` : ''
  return `${shown.charAt(0).toUpperCase()}${shown.slice(1)}${more}`
}

/** A section heading as a short name: "DEDICATION" -> "Dedication", trailing colons dropped. */
export function sectionDisplayName(text: string): string {
  const clean = text.replace(/\s+/g, ' ').replace(/[:.]+$/, '').trim()
  if (!clean) return ''
  const words = clean.split(' ')
  const shouted = clean === clean.toUpperCase()
  const titled = words
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && ['a', 'an', 'and', 'of', 'the', 'to', 'in', 'on', 'for'].includes(lower)) return lower
      return shouted ? lower.charAt(0).toUpperCase() + lower.slice(1) : word
    })
    .join(' ')
  return titled.length > 40 ? `${titled.slice(0, 39)}…` : titled
}

/**
 * Card title for body paragraphs that need the same fix:
 * one paragraph -> "Inconsistent formatting: Remove bold & italic";
 * several in a section -> "Dedication (4 paragraphs) — Remove bold & italic".
 */
export function bodySuggestionLabel(fix: SuggestedFix, count: number, sectionName: string): string {
  const change = describeFix(fix)
  if (count > 1) {
    const where = sectionName ? `${sectionName} (${count} paragraphs)` : `${count} paragraphs`
    return `${where} — ${change}`
  }
  return `Inconsistent formatting: ${change}`
}

/** Card subtitle for body paragraphs: what they are being matched to. */
export function bodySuggestionDetail(presetName: string | null): string {
  return presetName ? `Matches the ${presetName} preset` : 'Matches the rest of your body text'
}

/** Kinds of short line the scanner checks (mirrors ShortLineGroup). */
export type LineKind =
  | 'title_page' | 'front_label' | 'heading_1' | 'heading_2' | 'heading_3' | 'caption'
  | 'subheading' | 'figure_title' | 'table_title'

/** Card title for short lines: "Format as Chapter Heading", "Standardize title page lines". */
export function lineSuggestionLabel(kind: LineKind, count: number): string {
  const many = count > 1
  switch (kind) {
    case 'heading_1':
      return many ? `Format ${count} chapter headings alike` : 'Format as Chapter Heading'
    case 'heading_2':
    case 'subheading':
      return many ? `Standardize ${count} section headings` : 'Standardize Section Heading'
    case 'heading_3':
      return many ? `Standardize ${count} subsection headings` : 'Standardize Subsection Heading'
    case 'title_page':
      return many ? `Standardize ${count} title page lines` : 'Standardize title page line'
    case 'front_label':
      return many ? `Standardize ${count} section labels` : 'Standardize section label'
    case 'caption':
      return many ? `Standardize ${count} captions` : 'Standardize caption'
    case 'figure_title':
      return many ? `Standardize ${count} figure titles` : 'Standardize figure title'
    case 'table_title':
      return many ? `Standardize ${count} table titles` : 'Standardize table title'
  }
}

/**
 * Card subtitle for short lines: the change, then what it matches. `basis` replaces "matches the
 * others" when the look comes from a convention ("thesis title pages are centered").
 */
export function lineSuggestionDetail(fix: SuggestedFix, presetName: string | null, basis?: string): string {
  const reason = presetName ? `matches the ${presetName} preset` : basis ?? 'matches the others'
  return `${describeFix(fix)} · ${reason}`
}

/** Card subtitle for a list item that differs from the other items of its list. */
export const LIST_ITEM_DETAIL = 'Matches the other items in this list'
