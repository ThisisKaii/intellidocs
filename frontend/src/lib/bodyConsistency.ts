import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { lengthToPt, readLineHeight, readStyleDecl } from './inlineStyle'

/** The look of one body paragraph, read over all of its text rather than only its first word. */
export interface BodyStyle {
  bold: boolean
  italic: boolean
  /** Size set on the text itself (pt), or null when it inherits the paragraph's size. */
  fontSize: number | null
  textAlign: string
  /** Size the text renders at (pt): its own size, else the paragraph's; null when neither says. */
  effectiveSizePt: number | null
  /** Unitless line spacing from the paragraph's style, or null when it inherits. */
  lineHeight: number | null
  /** First-line indent in pt (a leading tab counts as 0.5in), or null when the paragraph does not say. */
  firstIndentPt: number | null
}

/** The body properties a document (or its preset) settles on; a missing key has no clear answer. */
export type BodyBaseline = Partial<BodyStyle>

/** Where each settled property came from. */
export type BaselineSource = Partial<Record<keyof BodyStyle, 'document' | 'preset'>>

/** The body text rules an academic preset states. */
export interface PresetBodyRules {
  name: string
  fontSizePt: number
  lineHeight: number
  firstIndentPt: number
}

/** A body paragraph whose look departs from the document's usual body text. */
export interface BodyDeviation {
  pos: number
  node: ProseMirrorNode
  text: string
  style: BodyStyle
  /** The baseline values of exactly the properties that differ: applying them fixes the paragraph. */
  fix: BodyBaseline
  /** Which properties differ, in plain words. */
  differences: string[]
}

/** Where the whole body departs from the preset (the same in every paragraph, so offered once). */
export interface PresetGap {
  property: 'effectiveSizePt' | 'lineHeight' | 'firstIndentPt'
  document: number
  preset: number
}

export interface BodySweep {
  deviations: BodyDeviation[]
  baseline: BodyBaseline | null
  source: BaselineSource
  presetGaps: PresetGap[]
  /** Every body paragraph, for "apply to all" actions. */
  members: Array<{ pos: number; node: ProseMirrorNode; text: string }>
}

/** Shorter lines are title-page text, captions or labels, which are styled on purpose. */
const MIN_PROSE_CHARS = 80
/** Fewer paragraphs than this give no reliable "usual" look. */
const MIN_PROSE_BLOCKS = 8
/**
 * Share of the body one value of a property must cover to be the usual one. Each property is
 * judged on its own: a document can be messy in several ways at once (some paragraphs bold,
 * others italic, others off-aligned) while each property still has a clear usual value.
 */
const MIN_PROPERTY_SHARE = 0.6
/** A leading tab indents the first line by Word's default tab stop. */
const TAB_INDENT_PT = 36

/** The first line of the body proper. */
const BODY_START = /^(chapter\s+(1|one|i)|1\.?\s+introduction|introduction|abstract)\s*[:.]?$/i
/** A list typed as paragraphs ("1.2. ...", "a) ...", "• ..."): hanging indents on purpose, not body text. */
const MANUAL_LIST_ITEM = /^(?:(?:\d+(?:\.\d+)*\.?|[a-z][.)]|\([a-z0-9]+\))\s|[^\w\s"'([]\s|\d+(?:\.\d+)*\.(?=\S))/i
/** Front-matter sections written as prose; they follow the body's look but do not define it. */
const PROSE_FRONT_MATTER = /^(acknowledge?ments?|dedication|preface|foreword|abstract|executive summary)\s*[:.]?$/i

/** Containers whose paragraphs are not running body text. */
const SKIPPED_ANCESTORS = new Set([
  'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader',
  'blockquote', 'codeBlock', 'columnSection',
])

/** The look of a paragraph: bold or italic when most of its characters carry it (a few bold terms do not count). */
export function bodyStyleOf(node: ProseMirrorNode): BodyStyle {
  let boldChars = 0
  let italicChars = 0
  let totalChars = 0
  let fontSize: number | null = null
  let sawText = false
  let leadingTab = false
  node.forEach((child, _offset, index) => {
    if (index === 0 && (child.type.name === 'tab' || (child.isText && child.text?.startsWith('\t')))) leadingTab = true
    if (!child.isText || !child.text?.trim()) return
    const length = child.text.trim().length
    totalChars += length
    if (child.marks.some((mark) => mark.type.name === 'bold')) boldChars += length
    if (child.marks.some((mark) => mark.type.name === 'italic')) italicChars += length
    if (!sawText) {
      const raw = child.marks.find((mark) => mark.type.name === 'textStyle')?.attrs?.fontSize
      const parsed = typeof raw === 'string' ? parseFloat(raw) : NaN
      fontSize = Number.isNaN(parsed) ? null : parsed
    }
    sawText = true
  })
  const style = typeof node.attrs.style === 'string' ? node.attrs.style : null
  const align = typeof node.attrs.textAlign === 'string' && node.attrs.textAlign ? node.attrs.textAlign : 'left'
  const textIndent = lengthToPt(readStyleDecl(style, 'text-indent'))
  return {
    bold: sawText && boldChars / totalChars > 0.5,
    italic: sawText && italicChars / totalChars > 0.5,
    fontSize,
    textAlign: align,
    effectiveSizePt: fontSize ?? lengthToPt(readStyleDecl(style, 'font-size')),
    lineHeight: readLineHeight(style),
    firstIndentPt: leadingTab ? Math.max(textIndent ?? 0, 0) + TAB_INDENT_PT : textIndent,
  }
}

/** The size inherited text renders at in the editor, and how far an explicit size must stray from it to count. */
const INHERITED_PT = 11
const INHERITED_TOLERANCE_PT = 2

/** Whether two text sizes read as different; an explicit size close to the inherited one is the same look. */
function sizesDiffer(modal: number | null, style: number | null): boolean {
  if (modal === style) return false
  if (modal !== null && style !== null) return true
  const explicit = modal ?? style
  return explicit !== null && Math.abs(explicit - INHERITED_PT) >= INHERITED_TOLERANCE_PT
}

/** How far numeric properties may differ and still read as the same; also their counting granularity. */
const TOLERANCE: Record<'effectiveSizePt' | 'lineHeight' | 'firstIndentPt', number> = {
  effectiveSizePt: 0.5,
  lineHeight: 0.15,
  firstIndentPt: 9,
}

type NumericProperty = keyof typeof TOLERANCE
/** Paragraph spacing is left out: authors vary it on purpose (more space before a new section). */
const NUMERIC: NumericProperty[] = ['lineHeight', 'firstIndentPt']

/** The value most paragraphs share, when it covers enough of them; numbers are bucketed by their tolerance. */
function usualValue<T>(values: T[], bucket: (value: T) => string, total: number): { value: T } | null {
  if (values.length === 0) return null
  const counts = new Map<string, { value: T; count: number }>()
  for (const value of values) {
    const key = bucket(value)
    const entry = counts.get(key) ?? { value, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  let best: { value: T; count: number } | null = null
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry
  return best && best.count / total >= MIN_PROPERTY_SHARE ? { value: best.value } : null
}

/** Bucket a number by a tolerance so near-equal values count together. */
const numberBucket = (tolerance: number) => (value: number): string => String(Math.round(value / tolerance))

/** Settle each property from the document's body, falling back to the preset where the document has no clear answer. */
function settleBaseline(
  styles: BodyStyle[],
  preset: PresetBodyRules | null
): { baseline: BodyBaseline; source: BaselineSource } {
  const baseline: BodyBaseline = {}
  const source: BaselineSource = {}
  const total = styles.length
  const settle = <K extends keyof BodyStyle>(key: K, found: { value: BodyStyle[K] } | null): void => {
    if (!found) return
    baseline[key] = found.value
    source[key] = 'document'
  }
  settle('bold', usualValue(styles.map((s) => s.bold), String, total))
  settle('italic', usualValue(styles.map((s) => s.italic), String, total))
  settle('textAlign', usualValue(styles.map((s) => s.textAlign), String, total))
  // Text size: an explicit size close to the inherited one is the same look.
  settle('fontSize', usualValue(styles.map((s) => s.fontSize), (v) => (v === null || !sizesDiffer(null, v) ? 'inherited' : String(v)), total))
  for (const key of NUMERIC) {
    const known = styles.map((s) => s[key]).filter((v): v is number => v !== null)
    // A property most paragraphs leave unset is judged only where it is set.
    if (known.length >= Math.max(MIN_PROSE_BLOCKS / 2, total / 2)) {
      settle(key, usualValue(known, numberBucket(TOLERANCE[key]), known.length))
    }
  }
  const sizes = styles.map((s) => s.effectiveSizePt).filter((v): v is number => v !== null)
  if (sizes.length >= total / 2) settle('effectiveSizePt', usualValue(sizes, numberBucket(TOLERANCE.effectiveSizePt), sizes.length))

  if (preset) {
    const fill = (key: 'effectiveSizePt' | 'lineHeight' | 'firstIndentPt', value: number): void => {
      if (key in baseline) return
      baseline[key] = value
      source[key] = 'preset'
    }
    fill('effectiveSizePt', preset.fontSizePt)
    fill('lineHeight', preset.lineHeight)
    fill('firstIndentPt', preset.firstIndentPt)
  }
  return { baseline, source }
}

const describeNumber: Record<NumericProperty, (style: number, usual: number) => string> = {
  effectiveSizePt: (s, u) => `${s}pt instead of ${u}pt`,
  lineHeight: (s, u) => `line spacing ${s} instead of ${u}`,
  firstIndentPt: (s, u) => (s === 0 ? 'no first-line indent' : u === 0 ? 'an indented first line' : `a ${Math.round(s / 72 * 100) / 100}in indent instead of ${Math.round(u / 72 * 100) / 100}in`),
}

/** The baseline values a paragraph departs from, and those departures in plain words. */
function compare(baseline: BodyBaseline, style: BodyStyle): { fix: BodyBaseline; differences: string[] } {
  const fix: BodyBaseline = {}
  const differences: string[] = []
  if ('fontSize' in baseline && sizesDiffer(baseline.fontSize ?? null, style.fontSize)) {
    fix.fontSize = baseline.fontSize ?? null
    differences.push(style.fontSize !== null && baseline.fontSize != null ? `${style.fontSize}pt instead of ${baseline.fontSize}pt` : 'a different size')
  } else if (!('fontSize' in baseline) && typeof baseline.effectiveSizePt === 'number' && style.effectiveSizePt !== null &&
    Math.abs(style.effectiveSizePt - baseline.effectiveSizePt) >= TOLERANCE.effectiveSizePt) {
    // No usual size of the text itself: judge the size it renders at against the preset.
    fix.fontSize = baseline.effectiveSizePt
    differences.push(describeNumber.effectiveSizePt(style.effectiveSizePt, baseline.effectiveSizePt))
  }
  if (baseline.bold !== undefined && baseline.bold !== style.bold) {
    fix.bold = baseline.bold
    differences.push(style.bold ? 'bold' : 'not bold')
  }
  if (baseline.italic !== undefined && baseline.italic !== style.italic) {
    fix.italic = baseline.italic
    differences.push(style.italic ? 'italic' : 'not italic')
  }
  if (baseline.textAlign !== undefined && baseline.textAlign !== style.textAlign) {
    fix.textAlign = baseline.textAlign
    differences.push(`${style.textAlign}-aligned instead of ${baseline.textAlign}`)
  }
  for (const key of NUMERIC) {
    const usual = baseline[key]
    const own = style[key]
    if (usual === undefined || usual === null || own === null) continue
    if (Math.abs(own - usual) < TOLERANCE[key]) continue
    fix[key] = usual
    differences.push(describeNumber[key](own, usual))
  }
  return { fix, differences }
}

/**
 * Body paragraphs that look different from the rest of the body text, judged property by property
 * against the document's usual body look (the preset fills in properties the document has no clear
 * answer for). Prose in front-matter sections such as the acknowledgement is held to the body's
 * look as well. `presetGaps` lists where the whole body departs from the preset.
 */
export function findBodyDeviations(doc: ProseMirrorNode, preset: PresetBodyRules | null = null): BodySweep {
  const members: Array<{ pos: number; node: ProseMirrorNode; text: string; style: BodyStyle }> = []
  const frontProse: typeof members = []
  // Cover pages, approval sheets and tables of contents are styled by hand; the body starts at the first chapter.
  let markerSeen = false
  let inProseFrontMatter = false
  doc.descendants((node, pos) => {
    if (SKIPPED_ANCESTORS.has(node.type.name)) return false
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!markerSeen && BODY_START.test(text)) {
      markerSeen = true
      members.length = 0
    } else if (!markerSeen && text.length < MIN_PROSE_CHARS) {
      // A short line before the body opens (or closes) a front-matter section.
      if (PROSE_FRONT_MATTER.test(text)) inProseFrontMatter = true
      else if (/^[A-Z][A-Z\s]{3,}$/.test(text)) inProseFrontMatter = false
    }
    if (node.type.name !== 'paragraph') return false
    if (text.length >= MIN_PROSE_CHARS && !/^(table|figure)\s+\d+\s*[:.]/i.test(text) && !/^\[\d+\]/.test(text) && !MANUAL_LIST_ITEM.test(text)) {
      const entry = { pos, node, text, style: bodyStyleOf(node) }
      if (markerSeen) members.push(entry)
      else if (inProseFrontMatter) frontProse.push(entry)
      else members.push(entry)
    }
    return false
  })
  if (members.length < MIN_PROSE_BLOCKS) return { deviations: [], baseline: null, source: {}, presetGaps: [], members: [] }

  const { baseline, source } = settleBaseline(members.map((member) => member.style), preset)
  const deviations: BodyDeviation[] = []
  for (const member of [...frontProse, ...members]) {
    const { fix, differences } = compare(baseline, member.style)
    if (differences.length > 0) deviations.push({ ...member, fix, differences })
  }
  deviations.sort((a, b) => a.pos - b.pos)

  // The body as a whole against the preset: only properties the document itself settles.
  const presetGaps: PresetGap[] = []
  if (preset) {
    const wanted: Array<[PresetGap['property'], number]> = [
      ['effectiveSizePt', preset.fontSizePt],
      ['lineHeight', preset.lineHeight],
      ['firstIndentPt', preset.firstIndentPt],
    ]
    for (const [property, presetValue] of wanted) {
      const own = baseline[property]
      if (source[property] !== 'document' || typeof own !== 'number') continue
      if (Math.abs(own - presetValue) >= TOLERANCE[property]) presetGaps.push({ property, document: own, preset: presetValue })
    }
  }
  return { deviations, baseline, source, presetGaps, members: members.map(({ pos, node, text }) => ({ pos, node, text })) }
}

/** Plain words for one preset gap, e.g. "11pt (the preset uses 12pt)". */
export function describePresetGap(gap: PresetGap): string {
  if (gap.property === 'effectiveSizePt') return `${gap.document}pt text (preset: ${gap.preset}pt)`
  if (gap.property === 'lineHeight') return `line spacing ${Math.round(gap.document * 100) / 100} (preset: ${gap.preset === 2 ? 'double' : gap.preset})`
  return gap.document === 0
    ? `no first-line indent (preset: ${Math.round(gap.preset / 72 * 100) / 100}in)`
    : `a ${Math.round(gap.document / 72 * 100) / 100}in first-line indent (preset: ${Math.round(gap.preset / 72 * 100) / 100}in)`
}

/** CSS declarations that set a paragraph's line spacing and first-line indent to baseline values. */
export function blockStyleFor(fix: BodyBaseline): Record<string, string> {
  const decls: Record<string, string> = {}
  if (typeof fix.lineHeight === 'number') decls['line-height'] = String(fix.lineHeight)
  if (typeof fix.firstIndentPt === 'number') decls['text-indent'] = `${Math.round(fix.firstIndentPt * 100) / 100}pt`
  return decls
}
