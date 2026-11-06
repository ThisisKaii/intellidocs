import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { lengthToPt, readStyleDecl } from './inlineStyle'

/** The kinds of short line that are styled alike within their kind. */
export type ShortLineGroup = 'title_page' | 'front_label' | 'heading_1' | 'heading_2' | 'heading_3' | 'caption'

/** How a heading level should look under a preset. */
export interface PresetHeadingLook {
  textAlign: string
  bold: boolean
  italic: boolean
  fontSizePt: number
}

/** What an academic preset says about short lines. */
export interface PresetLineRules {
  name: string
  /** Alignment of every title-page line, when the preset has a title page. */
  titlePageAlign?: string
  headings: Record<1 | 2 | 3, PresetHeadingLook>
}

/** The look of a short line. */
export interface LineStyle {
  bold: boolean
  italic: boolean
  textAlign: string
  /** Size the line renders at (pt): its text's own size, else the block's; null when neither says. */
  sizePt: number | null
}

/** A short line styled differently from the others of its kind. */
export interface LineDeviation {
  pos: number
  node: ProseMirrorNode
  text: string
  group: ShortLineGroup
  /** The usual values of exactly the properties that differ. */
  fix: Partial<LineStyle>
  differences: string[]
  /** Whether the usual look came from the preset rather than the document. */
  fromPreset: boolean
}

/** Section labels of a thesis's front and back matter, set like chapter headings. */
const FRONT_LABEL = /^(approval sheet|acknowledge?ments?|dedication|abstract|preface|foreword|table of contents|list of (tables|figures|abbreviations|appendices)|curriculum vitae|references|bibliography|appendices)$/i
/** The first label after a title page ends it. */
const TITLE_PAGE_END = /^(approval sheet|acknowledge?ments?|dedication|abstract|preface|foreword|table of contents|introduction|chapter\s+\S+)/i
const CAPTION = /^(figure|fig\.|table)\s+\d+/i
/** Share of a kind one value must cover to be the usual one, and the fewest lines that settle it. */
const MIN_SHARE = 0.6
const MIN_MEMBERS = 3
const MAX_TITLE_PAGE_LINES = 25

const SKIPPED_ANCESTORS = new Set([
  'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader', 'codeBlock',
])

/** The look of a short line: bold or italic only when all of its text is. */
export function lineStyleOf(node: ProseMirrorNode): LineStyle {
  let bold = true
  let italic = true
  let size: number | null = null
  let sawText = false
  node.forEach((child) => {
    if (!child.isText || !child.text?.trim()) return
    bold &&= child.marks.some((mark) => mark.type.name === 'bold')
    italic &&= child.marks.some((mark) => mark.type.name === 'italic')
    if (!sawText) {
      const raw = child.marks.find((mark) => mark.type.name === 'textStyle')?.attrs?.fontSize
      size = typeof raw === 'string' ? lengthToPt(raw) : null
    }
    sawText = true
  })
  const style = typeof node.attrs.style === 'string' ? node.attrs.style : null
  return {
    bold: sawText && bold,
    italic: sawText && italic,
    textAlign: typeof node.attrs.textAlign === 'string' && node.attrs.textAlign ? node.attrs.textAlign : 'left',
    sizePt: size ?? lengthToPt(readStyleDecl(style, 'font-size')),
  }
}

/** Which properties each kind is judged on: title pages mix sizes and weights on purpose. */
const JUDGED: Record<ShortLineGroup, Array<keyof LineStyle>> = {
  title_page: ['textAlign'],
  front_label: ['textAlign', 'bold'],
  heading_1: ['textAlign', 'bold', 'italic', 'sizePt'],
  heading_2: ['textAlign', 'bold', 'italic', 'sizePt'],
  heading_3: ['textAlign', 'bold', 'italic', 'sizePt'],
  caption: ['textAlign', 'bold', 'italic'],
}

/** The preset's look for a kind, where it has one. */
function presetLook(group: ShortLineGroup, preset: PresetLineRules | null): Partial<LineStyle> | null {
  if (!preset) return null
  if (group === 'title_page') return preset.titlePageAlign ? { textAlign: preset.titlePageAlign } : null
  const level = group === 'heading_2' ? 2 : group === 'heading_3' ? 3 : 1
  if (group === 'caption') return null
  const look = preset.headings[level]
  // Front-matter labels are set like chapter headings.
  return { textAlign: look.textAlign, bold: look.bold, italic: look.italic, sizePt: look.fontSizePt }
}

const sizeKey = (size: number | null): string => (size === null ? 'x' : String(Math.round(size * 2) / 2))

/** The usual value of one property across a kind, or null when no value covers enough of it. */
function usual(styles: LineStyle[], key: keyof LineStyle): { value: LineStyle[keyof LineStyle] } | null {
  if (styles.length < MIN_MEMBERS) return null
  const counts = new Map<string, { value: LineStyle[keyof LineStyle]; count: number }>()
  for (const style of styles) {
    const value = style[key]
    const bucket = key === 'sizePt' ? sizeKey(value as number | null) : String(value)
    const entry = counts.get(bucket) ?? { value, count: 0 }
    entry.count += 1
    counts.set(bucket, entry)
  }
  let best: { value: LineStyle[keyof LineStyle]; count: number } | null = null
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry
  return best && best.count / styles.length >= MIN_SHARE ? { value: best.value } : null
}

/** Plain words for one difference. */
function describe(key: keyof LineStyle, own: LineStyle[keyof LineStyle], wanted: LineStyle[keyof LineStyle]): string {
  if (key === 'textAlign') return `${own}-aligned instead of ${wanted}`
  if (key === 'sizePt') return `${own ?? 'default'}pt instead of ${wanted}pt`
  if (key === 'bold') return own ? 'bold' : 'not bold'
  return own ? 'italic' : 'not italic'
}

/**
 * Short lines styled differently from the others of their kind: title-page lines, front-matter
 * labels, headings of each level and captions. Each property is judged on its own against the
 * document's usual value for that kind; where the document has no clear answer the preset's
 * rule is used, when the preset has one. Title-page lines are judged only by a preset's rule.
 */
export function findShortLineDeviations(doc: ProseMirrorNode, preset: PresetLineRules | null = null): LineDeviation[] {
  const groups = new Map<ShortLineGroup, Array<{ pos: number; node: ProseMirrorNode; text: string; style: LineStyle }>>()
  let titlePageOpen = true
  let titlePageLines = 0
  const add = (group: ShortLineGroup, pos: number, node: ProseMirrorNode): void => {
    const list = groups.get(group) ?? []
    list.push({ pos, node, text: node.textContent.trim(), style: lineStyleOf(node) })
    groups.set(group, list)
  }

  doc.descendants((node, pos) => {
    if (SKIPPED_ANCESTORS.has(node.type.name)) return false
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text) return false
    // A title page is the run of short lines a document opens with: the first heading, front-matter
    // label or sentence of prose ends it.
    const prose = text.length >= 80 && /[.!?]$/.test(text)
    if (titlePageOpen && (node.type.name === 'heading' || prose || TITLE_PAGE_END.test(text) || titlePageLines >= MAX_TITLE_PAGE_LINES)) {
      titlePageOpen = false
    }

    if (CAPTION.test(text) && text.length < 120) add('caption', pos, node)
    else if (FRONT_LABEL.test(text.replace(/[:.]$/, ''))) add('front_label', pos, node)
    else if (node.type.name === 'heading' && text.length < 120) {
      const level = Number(node.attrs.level)
      add(level === 2 ? 'heading_2' : level === 3 ? 'heading_3' : 'heading_1', pos, node)
    } else if (titlePageOpen && node.type.name === 'paragraph' && text.length < 200) {
      titlePageLines += 1
      add('title_page', pos, node)
    }
    return false
  })

  const deviations: LineDeviation[] = []
  for (const [group, members] of groups) {
    const styles = members.map((member) => member.style)
    const fallback = presetLook(group, preset)
    const wanted: Partial<LineStyle> = {}
    const fromPreset = new Set<keyof LineStyle>()
    for (const key of JUDGED[group]) {
      // A title page's layout is a convention of the document type, not something its lines vote
      // on: it is judged only by a preset that defines it.
      if (group === 'title_page') {
        if (fallback?.[key] !== undefined) {
          ;(wanted as Record<string, unknown>)[key] = fallback[key]
          fromPreset.add(key)
        }
        continue
      }
      const found = usual(styles, key)
      if (found) {
        ;(wanted as Record<string, unknown>)[key] = found.value
      } else if (fallback && fallback[key] !== undefined && members.length >= MIN_MEMBERS) {
        ;(wanted as Record<string, unknown>)[key] = fallback[key]
        fromPreset.add(key)
      }
    }
    for (const member of members) {
      const fix: Partial<LineStyle> = {}
      const differences: string[] = []
      for (const key of JUDGED[group]) {
        if (!(key in wanted)) continue
        const own = member.style[key]
        const target = wanted[key]
        const differs = key === 'sizePt'
          ? own !== null && typeof target === 'number' && Math.abs((own as number) - target) >= 0.5
          : own !== target
        if (!differs) continue
        ;(fix as Record<string, unknown>)[key] = target
        differences.push(describe(key, own, target as LineStyle[keyof LineStyle]))
      }
      if (differences.length > 0) {
        deviations.push({ ...member, group, fix, differences, fromPreset: Object.keys(fix).some((key) => fromPreset.has(key as keyof LineStyle)) })
      }
    }
  }
  return deviations.sort((a, b) => a.pos - b.pos)
}
