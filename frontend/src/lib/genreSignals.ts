import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { DocumentGenre, MarginValues } from '@/services/api'
import { readSectionProps } from '@/lib/sectionProps'

export type { DocumentGenre, GenreSource } from '@/services/api'

export const GENRE_OPTIONS: ReadonlyArray<{ value: DocumentGenre; label: string; hint: string }> = [
  { value: 'ieee', label: 'IEEE paper', hint: '10pt, compact, two columns' },
  { value: 'thesis', label: 'Thesis', hint: '12pt, double spaced, 1.5in binding margin' },
  { value: 'memo', label: 'Memo', hint: 'TO / FROM / SUBJECT header' },
  { value: 'general', label: 'General', hint: 'Everything else' },
]

/** Short label shown on the toolbar badge. */
export function genreShortLabel(genre: DocumentGenre): string {
  return genre === 'ieee' ? 'IEEE' : genre === 'thesis' ? 'Thesis' : genre === 'memo' ? 'Memo' : 'General'
}

/** Structural signals sent to POST /documents/:id/genre/detect (mirrors the server Zod schema). */
export interface GenreSignals {
  formattingPreset?: string | null
  twoColumn?: boolean
  margins?: MarginValues
  bodyFontPt?: number | null
  lineHeight?: number | null
  headings?: string[]
  sample?: string
}

const MAX_HEADINGS = 60
const SAMPLE_CHARS = 3000
const PX_PER_PT = 96 / 72

/** Text of the document's headings, in order (capped). */
export function collectHeadings(doc: ProseMirrorNode): string[] {
  const headings: string[] = []
  doc.descendants((node) => {
    if (headings.length >= MAX_HEADINGS) return false
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) headings.push(text.slice(0, 200))
      return false
    }
    return true
  })
  return headings
}

/** True when any section of the document is laid out in two or more columns. */
export function hasMultiColumnSection(doc: ProseMirrorNode): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'sectionMark') {
      const props = readSectionProps(node.attrs.sectionProps)
      if (props && props.columns.count >= 2) found = true
      return false
    }
    return true
  })
  return found
}

/** Most frequent value in a list (ties keep the first seen), or null for an empty list. */
function mode(values: number[]): number | null {
  const counts = new Map<number, number>()
  let best: number | null = null
  let bestCount = 0
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1
    counts.set(value, next)
    if (next > bestCount) {
      best = value
      bestCount = next
    }
  }
  return best
}

/**
 * Measure the rendered body typography: the most common paragraph font size (pt) and line-height
 * multiplier. Read from the DOM because spacing comes from presets and imported styles, not from
 * document attributes. Returns nulls when nothing measurable is rendered.
 */
export function measureBodyTypography(root: HTMLElement | null): { bodyFontPt: number | null; lineHeight: number | null } {
  if (!root || typeof window === 'undefined') return { bodyFontPt: null, lineHeight: null }
  const sizes: number[] = []
  const ratios: number[] = []
  const paragraphs = Array.from(root.querySelectorAll('p')).filter((p) => (p.textContent ?? '').trim().length > 40).slice(0, 40)
  for (const paragraph of paragraphs) {
    const style = window.getComputedStyle(paragraph)
    const fontPx = parseFloat(style.fontSize)
    const linePx = parseFloat(style.lineHeight)
    if (!Number.isFinite(fontPx) || fontPx <= 0) continue
    sizes.push(Math.round((fontPx / PX_PER_PT) * 2) / 2)
    if (Number.isFinite(linePx) && linePx > 0) ratios.push(Math.round((linePx / fontPx) * 10) / 10)
  }
  return { bodyFontPt: mode(sizes), lineHeight: mode(ratios) }
}

/** Assemble the structural signals for genre detection. */
export function buildGenreSignals(input: {
  doc: ProseMirrorNode
  root: HTMLElement | null
  margins: MarginValues
  formattingPreset: string | null
  twoColumnLayout: boolean
}): GenreSignals {
  const typography = measureBodyTypography(input.root)
  return {
    formattingPreset: input.formattingPreset,
    twoColumn: input.twoColumnLayout || hasMultiColumnSection(input.doc),
    margins: input.margins,
    bodyFontPt: typography.bodyFontPt,
    lineHeight: typography.lineHeight,
    headings: collectHeadings(input.doc),
    sample: input.doc.textBetween(0, input.doc.content.size, '\n', ' ').slice(0, SAMPLE_CHARS),
  }
}
