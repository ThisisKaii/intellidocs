import { DocumentGenre } from '../types/index'
import { genreForPreset } from '../utils/documentGenre'
import { inferDocumentStructure } from './inferDocumentStructure'

/** Structural signals the editor extracts from a document for genre classification. */
export interface GenreSignals {
  formattingPreset?: string | null
  twoColumn?: boolean
  /** Page margins in inches. */
  margins?: { top: number; bottom: number; left: number; right: number }
  /** Most common body-text font size in points. */
  bodyFontPt?: number | null
  /** Body line-height multiplier (1 = single, 2 = double). */
  lineHeight?: number | null
  headings?: string[]
  /** Opening text of the document. */
  sample?: string
}

export interface GenreClassification {
  genre: DocumentGenre
  /** 0.5 (no evidence) to 0.95 (one genre clearly ahead). */
  confidence: number
  /** Human-readable evidence, strongest contributions first. */
  reasons: string[]
}

/** Below this score the document stays 'general': the evidence is too thin to specialize. */
const MIN_SPECIALIZED_SCORE = 2

/** Memo header lines: TO:, FROM:, SUBJECT:/RE:, DATE:, CC: at the start of a line. */
const MEMO_HEADER = /^\s*(to|from|subject|re|date|cc)\s*:/gim

/**
 * Classify a document into ieee / thesis / memo / general from its structure: preset, column
 * layout, margins, body font size, line spacing, headings, and the markers in its opening text.
 * Every rule adds weighted evidence to one genre; the strongest genre wins once it clears a
 * minimum score, otherwise the document is 'general'.
 */
export function classifyDocumentGenre(signals: GenreSignals): GenreClassification {
  const scores: Record<DocumentGenre, number> = { ieee: 0, thesis: 0, memo: 0, general: 0 }
  const evidence: Array<{ genre: DocumentGenre; weight: number; reason: string }> = []
  const add = (genre: DocumentGenre, weight: number, reason: string): void => {
    scores[genre] += weight
    evidence.push({ genre, weight, reason })
  }

  const presetGenre = genreForPreset(signals.formattingPreset)
  if (signals.formattingPreset && presetGenre !== 'general') {
    add(presetGenre, 3, `Uses the ${signals.formattingPreset.split('__')[0]} preset`)
  }

  if (signals.twoColumn) add('ieee', 2, 'Two-column layout')

  const margins = signals.margins
  if (margins) {
    if (margins.left >= 1.4) add('thesis', 1.5, `Wide binding margin (${margins.left}in left)`)
    if (margins.left <= 0.75 && margins.right <= 0.75) add('ieee', 1, 'Narrow side margins')
  }

  const fontPt = signals.bodyFontPt
  if (typeof fontPt === 'number') {
    if (fontPt <= 10.5) add('ieee', 1, `Compact ${fontPt}pt body text`)
  }

  const lineHeight = signals.lineHeight
  if (typeof lineHeight === 'number') {
    if (lineHeight >= 1.9) add('thesis', 1.5, 'Double-spaced body')
    else if (lineHeight >= 1.45) add('thesis', 0.5, '1.5-spaced body')
  }

  const headings = (signals.headings ?? []).map((heading) => heading.trim().toLowerCase())
  if (headings.some((heading) => /^chapter\s+(\d+|[ivx]+|one|two|three|four|five)\b/.test(heading))) {
    add('thesis', 1.5, 'Chapter headings')
  }
  if (headings.some((heading) => /^(table of contents|acknowledg|dedication|approval sheet|list of figures)/.test(heading))) {
    add('thesis', 1, 'Thesis front matter')
  }
  if (headings.filter((heading) => /^[ivx]+\.\s+\S/.test(heading)).length >= 2) {
    add('ieee', 1, 'Roman-numeral section headings')
  }

  const sample = signals.sample ?? ''
  if (sample) {
    const structure = inferDocumentStructure(sample)
    if (structure.type === 'ieee_manuscript') add('ieee', 2, `IEEE markers (${structure.matchedMarkers.join(', ')})`)
    if (structure.type === 'academic_thesis') add('thesis', 2, `Thesis markers (${structure.matchedMarkers.join(', ')})`)

    const opening = sample.slice(0, 1500)
    if (/\bmemorandum\b|^\s*memo\s*$/im.test(opening)) add('memo', 2, 'Memorandum heading')
    const headerFields = new Set((opening.match(MEMO_HEADER) ?? []).map((field) => field.trim().toLowerCase().replace(/\s*:$/, '')))
    if (headerFields.size >= 3) add('memo', 3, 'TO / FROM / SUBJECT header block')
    else if (headerFields.size === 2) add('memo', 1.5, 'Partial memo header block')
  }

  const ranked = (Object.keys(scores) as DocumentGenre[]).sort((a, b) => scores[b] - scores[a])
  const [best, second] = ranked
  if (scores[best] < MIN_SPECIALIZED_SCORE) {
    return { genre: 'general', confidence: 0.5, reasons: ['No strong structural markers'] }
  }

  const margin = scores[best] - scores[second]
  const confidence = Math.min(0.95, 0.5 + (0.5 * margin) / scores[best])
  const reasons = evidence
    .filter((item) => item.genre === best)
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.reason)

  return { genre: best, confidence: Math.round(confidence * 100) / 100, reasons }
}
