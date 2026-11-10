import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { lengthToPt, readStyleDecl } from './inlineStyle'
import { FRONT_LABEL, createFrontMatterTracker } from './frontMatter'

/**
 * The kinds of short line that are styled alike within their kind. `subheading` groups a chapter's
 * level-2 headings with its bold one-line paragraph headings (authors mix both); `figure_title` is
 * the line naming a figure just above its "Figure N" caption; `table_title` is the line under a
 * "Table N" caption, set like that caption.
 */
export type ShortLineGroup =
  | 'title_page' | 'front_label' | 'heading_1' | 'heading_2' | 'heading_3' | 'caption'
  | 'subheading' | 'figure_title' | 'table_title'

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
  /** Whether it came from the document type's convention (no preset chosen), e.g. a centered thesis title page. */
  fromConvention?: boolean
}

/** What a document type expects where no preset says: a thesis title page is centered. */
export interface LineConventions {
  titlePageAlign?: 'left' | 'center' | 'right'
  /** Front-matter labels (APPROVAL SHEET, ACKNOWLEDGEMENT, ...): set like chapter headings, centered in a thesis. */
  frontLabelAlign?: 'left' | 'center' | 'right'
}

const CAPTION = /^(figure|fig\.|table)\s+\d+/i
const FIGURE_CAPTION = /^(figure|fig\.)\s+\d+/i
const TABLE_CAPTION = /^table\s+\d+/i
/** A title line names something: short and not closed like a sentence or a label ("Note:"). */
const TITLE_MAX_CHARS = 60
const ENDS_LIKE_SENTENCE = /[.!?:;]$/
/** Share of a kind one value must cover to be the usual one, and the fewest lines that settle it. */
const MIN_SHARE = 0.6
const MIN_MEMBERS = 3

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
  // A level-2 heading's alignment is judged with its chapter's other sub-headings (subheading).
  heading_2: ['bold', 'italic', 'sizePt'],
  heading_3: ['textAlign', 'bold', 'italic', 'sizePt'],
  caption: ['textAlign', 'bold', 'italic'],
  subheading: ['textAlign'],
  figure_title: ['textAlign', 'bold'],
  table_title: ['textAlign'],
}

/** The preset's look for a kind, where it has one. */
function presetLook(group: ShortLineGroup, preset: PresetLineRules | null): Partial<LineStyle> | null {
  if (!preset) return null
  if (group === 'title_page') return preset.titlePageAlign ? { textAlign: preset.titlePageAlign } : null
  if (group === 'caption' || group === 'figure_title' || group === 'table_title') return null
  const level = group === 'heading_2' || group === 'subheading' ? 2 : group === 'heading_3' ? 3 : 1
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
export function findShortLineDeviations(
  doc: ProseMirrorNode,
  preset: PresetLineRules | null = null,
  conventions: LineConventions = {},
): LineDeviation[] {
  // Text blocks in document order, so a line can be judged by its neighbours (a figure's title sits
  // just above its caption, a table's title just below its caption).
  const blocks: Array<{ pos: number; node: ProseMirrorNode; text: string; style: LineStyle; titlePage: boolean; chapter: number }> = []
  const regionOf = createFrontMatterTracker()
  let chapter = 0
  doc.descendants((node, pos) => {
    if (SKIPPED_ANCESTORS.has(node.type.name)) return false
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text) return false
    const isHeading = node.type.name === 'heading'
    // A chapter opens at each level-1 heading; sub-headings are compared within their chapter.
    if (isHeading && Number(node.attrs.level) === 1) chapter += 1
    // The title page is the run of short lines a document opens with (see lib/frontMatter).
    const titlePage = regionOf(text, isHeading) === 'title_page'
    blocks.push({ pos, node, text, style: lineStyleOf(node), titlePage, chapter })
    return false
  })

  // Members by group and scope ("subheading#2" is chapter 2's sub-headings).
  const groups = new Map<string, { group: ShortLineGroup; members: typeof blocks }>()
  const add = (group: ShortLineGroup, block: (typeof blocks)[number], scope = ''): void => {
    const key = `${group}#${scope}`
    const entry = groups.get(key) ?? { group, members: [] }
    entry.members.push(block)
    groups.set(key, entry)
  }
  // A table title takes its caption's alignment.
  const tableTitles: Array<{ block: (typeof blocks)[number]; caption: (typeof blocks)[number] }> = []

  blocks.forEach((block, index) => {
    const { node, text } = block
    const isHeading = node.type.name === 'heading'
    const next = blocks[index + 1]
    const previous = blocks[index - 1]
    const titleLike = text.length <= TITLE_MAX_CHARS && !ENDS_LIKE_SENTENCE.test(text) && !CAPTION.test(text)

    if (CAPTION.test(text) && text.length < 120) add('caption', block)
    else if (titleLike && next && FIGURE_CAPTION.test(next.text)) add('figure_title', block)
    else if (titleLike && previous && TABLE_CAPTION.test(previous.text)) tableTitles.push({ block, caption: previous })
    else if (FRONT_LABEL.test(text.replace(/[:.]$/, ''))) add('front_label', block)
    else if (isHeading && text.length < 120) {
      const level = Number(node.attrs.level)
      add(level === 2 ? 'heading_2' : level === 3 ? 'heading_3' : 'heading_1', block)
      if (level === 2) add('subheading', block, String(block.chapter))
    } else if (block.chapter > 0 && titleLike && block.style.bold && /[a-z]/.test(text)) {
      // A bold one-line paragraph inside a chapter is a sub-heading written by hand.
      add('subheading', block, String(block.chapter))
    } else if (block.titlePage && node.type.name === 'paragraph' && text.length < 200) {
      add('title_page', block)
    }
  })

  const deviations: LineDeviation[] = []
  // A table title is set like the captions: their usual alignment, or its own caption's when the
  // captions have no clear usual one (its caption may itself be the odd one out).
  const captionAlign = usual(Array.from(groups.values()).filter((g) => g.group === 'caption').flatMap((g) => g.members.map((m) => m.style)), 'textAlign')
  for (const { block, caption } of tableTitles) {
    const target = (captionAlign?.value as string | undefined) ?? caption.style.textAlign
    if (block.style.textAlign === target) continue
    deviations.push({
      ...block,
      group: 'table_title',
      fix: { textAlign: target },
      differences: [`${block.style.textAlign}-aligned instead of ${target} like the captions`],
      fromPreset: false,
    })
  }
  for (const { group, members } of groups.values()) {
    const styles = members.map((member) => member.style)
    const fallback = presetLook(group, preset)
    const wanted: Partial<LineStyle> = {}
    const fromPreset = new Set<keyof LineStyle>()
    let fromConvention = false
    for (const key of JUDGED[group]) {
      // A title page's layout is a convention of the document type, not something its lines vote
      // on (a sabotaged or careless title page is usually wrong on every line at once): it is judged
      // by the preset when one defines it, else by the document type's convention.
      if (group === 'title_page') {
        if (fallback?.[key] !== undefined) {
          ;(wanted as Record<string, unknown>)[key] = fallback[key]
          fromPreset.add(key)
        } else if (key === 'textAlign' && conventions.titlePageAlign) {
          wanted.textAlign = conventions.titlePageAlign
          fromConvention = true
        }
        continue
      }
      // Front-matter labels follow the same convention when no preset sets them: they are few, and
      // when all of them were moved together their own vote would endorse the wrong alignment.
      if (group === 'front_label' && key === 'textAlign' && fallback?.textAlign === undefined && conventions.frontLabelAlign) {
        wanted.textAlign = conventions.frontLabelAlign
        fromConvention = true
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
        deviations.push({
          ...member,
          group,
          fix,
          differences,
          fromPreset: Object.keys(fix).some((key) => fromPreset.has(key as keyof LineStyle)),
          ...(fromConvention ? { fromConvention: true } : {}),
        })
      }
    }
  }
  // A level-2 heading is judged in two groups (heading_2 and subheading): one suggestion per line.
  const merged = new Map<number, LineDeviation>()
  for (const deviation of deviations) {
    const existing = merged.get(deviation.pos)
    if (!existing) {
      merged.set(deviation.pos, deviation)
      continue
    }
    existing.fix = { ...existing.fix, ...deviation.fix }
    existing.differences = [...existing.differences, ...deviation.differences.filter((d) => !existing.differences.includes(d))]
    existing.fromPreset = existing.fromPreset || deviation.fromPreset
  }
  return Array.from(merged.values()).sort((a, b) => a.pos - b.pos)
}
