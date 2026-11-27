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
  /**
   * Space above the paragraph (pt; none set counts as 0). Null where space is expected anyway: a
   * paragraph after a heading, caption, list, table or figure is not judged on it.
   */
  spaceBeforePt: number | null
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
  /** End position of the inspected prose range (omitted when it matches pos + node.nodeSize). */
  endPos?: number
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

/** Glossary section whose PDF import flattens table rows into heading+paragraph pairs. */
const DEFINITION_TERMS = /^definition\s+of\s+terms\s*[:.]?$/i
/** Accidental bold clause length that still warrants unbolding (short "Term." lead-ins are exempt). */
const STRAY_BOLD_MIN_CHARS = 15
const STRAY_SIZE_MIN_CHARS = 5
const MIN_BODY_FONT_PT = 8

interface RunStats {
  bold: boolean
  hasStrayBold: boolean
  italic: boolean
  fontSize: number | null
  outlierSizePt: number | null
  textAlign: string | null
}

function inspectChildRuns(children: ProseMirrorNode[], paraSizePt: number | null): Omit<RunStats, 'textAlign'> {
  let boldChars = 0
  let nonLeadInBoldChars = 0
  let italicChars = 0
  let totalChars = 0
  let sawNonEmptyText = false
  const sizeWeights = new Map<number | null, number>()
  const explicitRuns: Array<{ size: number; chars: number }> = []

  for (const child of children) {
    if (!child.isText || !child.text) continue
    const trimmed = child.text.trim()
    if (!trimmed) continue
    const length = trimmed.length
    totalChars += length

    const isBold = child.marks.some((mark) => mark.type.name === 'bold')
    const isItalic = child.marks.some((mark) => mark.type.name === 'italic')
    const isScript = child.marks.some((mark) => mark.type.name === 'superscript' || mark.type.name === 'subscript')

    if (isBold) {
      boldChars += length
      const isLeadInTerm = !sawNonEmptyText && /[.:]$/.test(trimmed) && length <= 40
      if (!isLeadInTerm) nonLeadInBoldChars += length
    }
    if (isItalic) italicChars += length

    if (!isScript) {
      const raw = child.marks.find((mark) => mark.type.name === 'textStyle')?.attrs?.fontSize
      const parsed = typeof raw === 'string' ? parseFloat(raw) : NaN
      const size = Number.isNaN(parsed) || parsed <= 0 ? null : parsed
      sizeWeights.set(size, (sizeWeights.get(size) ?? 0) + length)
      if (size !== null && size >= MIN_BODY_FONT_PT && length >= STRAY_SIZE_MIN_CHARS) {
        explicitRuns.push({ size, chars: length })
      }
    }
    sawNonEmptyText = true
  }

  // Pick the character-weighted dominant run size; fallback null if nothing explicit.
  let dominantSize: number | null = null
  let bestWeight = -1
  for (const [size, weight] of sizeWeights) {
    if (weight > bestWeight) {
      bestWeight = weight
      dominantSize = size
    }
  }

  // Check if any substantial non-script run diverges from the rendered size of the paragraph.
  const renderedBase = dominantSize ?? paraSizePt
  let outlierSizePt: number | null = null
  for (const run of explicitRuns) {
    if (renderedBase !== null && Math.abs(run.size - renderedBase) >= TOLERANCE.effectiveSizePt) {
      outlierSizePt = run.size
      break
    }
    if (renderedBase === null && Math.abs(run.size - INHERITED_PT) >= INHERITED_TOLERANCE_PT) {
      outlierSizePt = run.size
      break
    }
  }

  const bold = sawNonEmptyText && boldChars / totalChars > 0.5
  const hasStrayBold =
    sawNonEmptyText && !bold && nonLeadInBoldChars >= STRAY_BOLD_MIN_CHARS && boldChars / totalChars <= 0.5
  return {
    bold,
    hasStrayBold,
    italic: sawNonEmptyText && italicChars / totalChars > 0.5,
    fontSize: dominantSize,
    outlierSizePt,
  }
}

interface InternalBodyStyle extends BodyStyle {
  _hasStrayBold?: boolean
  _outlierSizePt?: number | null
  _skipTextAlign?: boolean
}

/** The look of a paragraph: bold or italic when most of its characters carry it (a few bold terms do not count). */
export function bodyStyleOf(node: ProseMirrorNode): BodyStyle {
  const children: ProseMirrorNode[] = []
  let leadingTab = false
  node.forEach((child, _offset, index) => {
    if (index === 0 && (child.type.name === 'tab' || (child.isText && child.text?.startsWith('\t')))) leadingTab = true
    children.push(child)
  })
  const style = typeof node.attrs.style === 'string' ? node.attrs.style : null
  const paraSizePt = lengthToPt(readStyleDecl(style, 'font-size'))
  const runs = inspectChildRuns(children, paraSizePt)
  const align = typeof node.attrs.textAlign === 'string' && node.attrs.textAlign ? node.attrs.textAlign : 'left'
  const textIndent = lengthToPt(readStyleDecl(style, 'text-indent'))
  const effectiveSizePt = runs.fontSize ?? paraSizePt
  const result: InternalBodyStyle = {
    bold: runs.bold,
    italic: runs.italic,
    fontSize: runs.fontSize,
    textAlign: align,
    effectiveSizePt,
    lineHeight: readLineHeight(style, effectiveSizePt),
    firstIndentPt: leadingTab ? Math.max(textIndent ?? 0, 0) + TAB_INDENT_PT : textIndent,
    spaceBeforePt: lengthToPt(readStyleDecl(style, 'margin-top')) ?? 0,
    _hasStrayBold: runs.hasStrayBold,
    _outlierSizePt: runs.outlierSizePt,
  }
  return result
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
const TOLERANCE: Record<'effectiveSizePt' | 'lineHeight' | 'firstIndentPt' | 'spaceBeforePt', number> = {
  effectiveSizePt: 0.5,
  lineHeight: 0.15,
  firstIndentPt: 9,
  spaceBeforePt: 6,
}

type NumericProperty = keyof typeof TOLERANCE
/**
 * Space after a paragraph is left out: authors vary it on purpose (more room before a new section).
 * Space before is judged only between two paragraphs of prose (see spaceBeforePt).
 */
const NUMERIC: NumericProperty[] = ['lineHeight', 'firstIndentPt', 'spaceBeforePt']

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
  const alignEligible = styles.filter((s) => !(s as InternalBodyStyle)._skipTextAlign).map((s) => s.textAlign)
  if (alignEligible.length >= Math.max(MIN_PROSE_BLOCKS / 2, total / 2)) {
    settle('textAlign', usualValue(alignEligible, String, alignEligible.length))
  }
  // Text size: an explicit size close to the inherited one is the same look.
  settle('fontSize', usualValue(styles.map((s) => s.fontSize), (v) => (v === null || !sizesDiffer(null, v) ? 'inherited' : String(v)), total))
  for (const key of NUMERIC) {
    const known = styles.map((s) => s[key]).filter((v): v is number => v !== null)
    // A property most paragraphs leave unset is judged only where it is set. Space above is judged
    // only between two prose paragraphs, which can be a minority (blank spacer lines are common), so
    // it settles from enough such pairs rather than from half the body.
    const enough = key === 'spaceBeforePt' ? MIN_PROSE_BLOCKS : Math.max(MIN_PROSE_BLOCKS / 2, total / 2)
    if (known.length >= enough) {
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
  spaceBeforePt: (s, u) => `${Math.round(s)}pt space above instead of ${Math.round(u)}pt`,
}

/** The baseline values a paragraph departs from, and those departures in plain words. */
function compare(baseline: BodyBaseline, style: InternalBodyStyle): { fix: BodyBaseline; differences: string[] } {
  const fix: BodyBaseline = {}
  const differences: string[] = []
  const resolvedTargetSize = baseline.effectiveSizePt ?? baseline.fontSize ?? null
  if ('fontSize' in baseline && sizesDiffer(baseline.fontSize ?? null, style.fontSize)) {
    fix.fontSize = resolvedTargetSize
    differences.push(style.fontSize !== null && resolvedTargetSize != null ? `${style.fontSize}pt instead of ${resolvedTargetSize}pt` : 'a different size')
  } else if (
    'fontSize' in baseline &&
    typeof baseline.effectiveSizePt === 'number' &&
    style.effectiveSizePt !== null &&
    Math.abs(style.effectiveSizePt - baseline.effectiveSizePt) >= TOLERANCE.effectiveSizePt
  ) {
    fix.fontSize = baseline.effectiveSizePt
    differences.push(describeNumber.effectiveSizePt(style.effectiveSizePt, baseline.effectiveSizePt))
  } else if (!('fontSize' in baseline) && typeof baseline.effectiveSizePt === 'number' && style.effectiveSizePt !== null &&
    Math.abs(style.effectiveSizePt - baseline.effectiveSizePt) >= TOLERANCE.effectiveSizePt) {
    fix.fontSize = baseline.effectiveSizePt
    differences.push(describeNumber.effectiveSizePt(style.effectiveSizePt, baseline.effectiveSizePt))
  } else if (
    style._outlierSizePt != null &&
    resolvedTargetSize !== null &&
    Math.abs(style._outlierSizePt - resolvedTargetSize) >= TOLERANCE.effectiveSizePt
  ) {
    fix.fontSize = resolvedTargetSize
    differences.push(describeNumber.effectiveSizePt(style._outlierSizePt, resolvedTargetSize))
  } else if (
    style._outlierSizePt != null &&
    resolvedTargetSize === null &&
    Math.abs(style._outlierSizePt - INHERITED_PT) >= INHERITED_TOLERANCE_PT
  ) {
    fix.fontSize = null
    differences.push(`${style._outlierSizePt}pt`)
  }
  if (baseline.bold !== undefined && (baseline.bold !== style.bold || (baseline.bold === false && style._hasStrayBold))) {
    fix.bold = baseline.bold
    differences.push(baseline.bold === false ? 'bold' : 'not bold')
  }
  if (baseline.italic !== undefined && baseline.italic !== style.italic) {
    fix.italic = baseline.italic
    differences.push(style.italic ? 'italic' : 'not italic')
  }
  if (!style._skipTextAlign && baseline.textAlign !== undefined && baseline.textAlign !== style.textAlign) {
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

/** A sentence that introduces what follows it: it ends in a colon. */
export function isLeadIn(text: string): boolean {
  return /:\s*$/.test(text)
}

/** A list item whose look differs from the other items of its list. */
export interface ListItemDeviation {
  pos: number
  node: ProseMirrorNode
  text: string
  /** The other items' usual values of exactly the properties that differ. */
  fix: Pick<BodyBaseline, 'bold' | 'italic' | 'fontSize'>
  differences: string[]
}

/** Fewer items than this give no reliable "usual" look for a list. */
const MIN_LIST_ITEMS = 3

/**
 * Items of one bullet or numbered list that look different from the rest of that list: one item
 * in italics, bold or another size among plain ones. Each list is judged on its own (a list of
 * bold terms is fine), and a property is only judged when all the other items agree on it.
 */
export function findListItemDeviations(doc: ProseMirrorNode): ListItemDeviation[] {
  const deviations: ListItemDeviation[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'table' || node.type.name === 'codeBlock') return false
    if (node.type.name !== 'bulletList' && node.type.name !== 'orderedList') return true
    const items: Array<{ pos: number; node: ProseMirrorNode; text: string; style: BodyStyle }> = []
    node.forEach((item, itemOffset) => {
      const first = item.firstChild
      if (!first || first.type.name !== 'paragraph') return
      const text = first.textContent.trim()
      if (!text) return
      // The item's paragraph sits one level inside the list item.
      items.push({ pos: pos + 1 + itemOffset + 1, node: first, text, style: bodyStyleOf(first) })
    })
    if (items.length >= MIN_LIST_ITEMS) {
      items.forEach((item, index) => {
        const others = items.filter((_, other) => other !== index).map((other) => other.style)
        const fix: ListItemDeviation['fix'] = {}
        const differences: string[] = []
        for (const key of ['bold', 'italic'] as const) {
          const values = new Set(others.map((style) => style[key]))
          if (values.size === 1 && !values.has(item.style[key])) {
            fix[key] = others[0][key]
            differences.push(item.style[key] ? key : `not ${key}`)
          }
        }
        const sizes = new Set(others.map((style) => (style.fontSize === null ? 'inherited' : String(style.fontSize))))
        if (sizes.size === 1 && sizesDiffer(others[0].fontSize, item.style.fontSize)) {
          fix.fontSize = others[0].fontSize
          differences.push(item.style.fontSize !== null ? `${item.style.fontSize}pt` : 'a different size')
        }
        if (differences.length > 0) deviations.push({ pos: item.pos, node: item.node, text: item.text, fix, differences })
      })
    }
    // Nested lists are judged as lists of their own.
    return true
  })
  return deviations
}

interface HardBreakSlice {
  text: string
  children: ProseMirrorNode[]
  from: number
  to: number
}

/** Partition a paragraph on hardBreak nodes so glued PDF headings and prose can be inspected separately. */
function hardBreakSlices(node: ProseMirrorNode, pos: number): HardBreakSlice[] {
  const slices: HardBreakSlice[] = []
  let children: ProseMirrorNode[] = []
  let start = pos + 1
  let offset = pos + 1
  let text = ''
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') {
      slices.push({ text: text.trim(), children, from: start, to: offset })
      children = []
      text = ''
      offset += child.nodeSize
      start = offset
      return
    }
    children.push(child)
    if (child.isText && child.text) text += child.text
    offset += child.nodeSize
  })
  slices.push({ text: text.trim(), children, from: start, to: offset })
  return slices
}

/**
 * Body paragraphs that look different from the rest of the body text, judged property by property
 * against the document's usual body look (the preset fills in properties the document has no clear
 * answer for). Prose in front-matter sections such as the acknowledgement is held to the body's
 * look as well. `presetGaps` lists where the whole body departs from the preset.
 */
export function findBodyDeviations(doc: ProseMirrorNode, preset: PresetBodyRules | null = null): BodySweep {
  const members: Array<{ pos: number; endPos?: number; node: ProseMirrorNode; text: string; style: InternalBodyStyle }> = []
  const frontProse: typeof members = []
  // Cover pages, approval sheets and tables of contents are styled by hand; the body starts at the first chapter.
  let markerSeen = false
  let inProseFrontMatter = false
  let inDefinitionTerms = false
  // Whether the block before the current one was a paragraph of prose (space above is judged only then).
  let previousIsProse = false
  doc.descendants((node, pos) => {
    if (SKIPPED_ANCESTORS.has(node.type.name)) {
      previousIsProse = false
      return false
    }
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
      // A table, figure, page break or other object: the paragraph after it may have space above.
      if (node.isBlock) previousIsProse = false
      return true
    }
    const text = node.textContent.trim()
    const slices = node.type.name === 'paragraph' ? hardBreakSlices(node, pos) : []
    const sliceTexts = slices.length > 1 ? slices.map((s) => s.text).filter(Boolean) : [text]

    const followsProse = previousIsProse
    const isCaption = /^(table|figure)\s+\d+\s*[:.]/i.test(text)
    previousIsProse = node.type.name === 'paragraph' && text.length >= MIN_PROSE_CHARS && !isCaption

    for (const part of sliceTexts) {
      if (!markerSeen && BODY_START.test(part)) {
        markerSeen = true
        members.length = 0
        inDefinitionTerms = false
      } else if (!markerSeen && part.length < MIN_PROSE_CHARS) {
        // A short line before the body opens (or closes) a front-matter section.
        if (PROSE_FRONT_MATTER.test(part)) inProseFrontMatter = true
        else if (/^[A-Z][A-Z\s]{3,}$/.test(part)) inProseFrontMatter = false
      }
      if (DEFINITION_TERMS.test(part)) {
        inDefinitionTerms = true
      } else if (
        inDefinitionTerms &&
        part.length < MIN_PROSE_CHARS &&
        (/^chapter\s+\S+/i.test(part) || /^(related literature|related studies|methodology)\s*[:.]?$/i.test(part))
      ) {
        inDefinitionTerms = false
      }
    }
    if (node.type.name === 'heading' && inDefinitionTerms && Number(node.attrs.level) === 1 && !DEFINITION_TERMS.test(text)) {
      inDefinitionTerms = false
    }
    if (node.type.name !== 'paragraph' || inDefinitionTerms) return false

    // When a PDF block glued short heading/caption lines above a prose paragraph via <br>,
    // isolate the prose tail so heading bold/alignment doesn't taint the body check.
    let targetPos = pos
    let targetEndPos: number | undefined
    let targetText = text
    let style: InternalBodyStyle = bodyStyleOf(node) as InternalBodyStyle
    let gluedToHeading = false

    if (slices.length > 1) {
      const firstLongIdx = slices.findIndex((s) => s.text.length >= MIN_PROSE_CHARS)
      if (firstLongIdx > 0 && slices.slice(0, firstLongIdx).every((s) => s.text.length < MIN_PROSE_CHARS)) {
        const tail = slices.slice(firstLongIdx)
        const proseText = tail.map((s) => s.text).join(' ').trim()
        const proseChildren = tail.flatMap((s) => s.children)
        const blockStyle = typeof node.attrs.style === 'string' ? node.attrs.style : null
        const paraSizePt = lengthToPt(readStyleDecl(blockStyle, 'font-size'))
        const proseRuns = inspectChildRuns(proseChildren, paraSizePt)
        targetPos = tail[0].from
        targetEndPos = tail[tail.length - 1].to
        targetText = proseText
        gluedToHeading = true
        style = {
          bold: proseRuns.bold,
          italic: proseRuns.italic,
          fontSize: proseRuns.fontSize,
          textAlign: style.textAlign,
          effectiveSizePt: proseRuns.fontSize ?? paraSizePt,
          lineHeight: style.lineHeight,
          firstIndentPt: null,
          spaceBeforePt: null,
          _hasStrayBold: proseRuns.hasStrayBold,
          _outlierSizePt: proseRuns.outlierSizePt,
          _skipTextAlign: true,
        }
      }
    }

    if (
      targetText.length >= MIN_PROSE_CHARS &&
      !/^(table|figure)\s+\d+\s*[:.]/i.test(targetText) &&
      !/^\[\d+\]/.test(targetText) &&
      !MANUAL_LIST_ITEM.test(targetText)
    ) {
      if (!followsProse && !gluedToHeading) style.spaceBeforePt = null
      // Lowercase opening means a mid-paragraph continuation split across a PDF page break.
      if (/^[a-z]/.test(targetText)) {
        style.firstIndentPt = null
        style.spaceBeforePt = null
      }
      // A lead-in sentence ("…this study aims to:") introduces the list or labelled paragraphs
      // under it; writers set it flush and tight on purpose, so its indent and space are not judged.
      if (isLeadIn(targetText)) {
        style.firstIndentPt = null
        style.spaceBeforePt = null
      }
      const entry = { pos: targetPos, ...(targetEndPos !== undefined ? { endPos: targetEndPos } : {}), node, text: targetText, style }
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
  if (typeof fix.spaceBeforePt === 'number') decls['margin-top'] = `${Math.round(fix.spaceBeforePt * 100) / 100}pt`
  return decls
}
