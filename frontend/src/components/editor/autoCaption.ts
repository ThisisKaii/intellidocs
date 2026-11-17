import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import { CAPTION_LABEL, captionText, chapterNumber, findCaptions, type CaptionConfig, type CaptionKind } from './captionNumbering'

/**
 * "Auto caption": find every figure and table without a caption and say where its caption goes
 * and what its title can be. Titles only ever come from the user's own words already in the
 * document (a picture's alt text or slot label, a table's title row); anything else is left
 * blank for the user to write. Nothing here invents a description.
 */

/** Where a caption's title came from, or null when the user still has to write it. */
export type CaptionTitleSource = 'alt text' | 'slot label' | 'title row' | null

export interface AutoCaptionItem {
  kind: CaptionKind
  /** Start of the figure (first picture of a group) or table. */
  from: number
  /** End of the figure group or table. */
  to: number
  /** Where the caption paragraph is inserted: above or below, as the caption settings say. */
  insertAt: number
  title: string | null
  titleSource: CaptionTitleSource
  /**
   * A table's title row taken as its caption title: the range removed when the caption is added,
   * so the title is not written twice (the row, or its row group when it holds nothing else).
   */
  moveFrom?: { from: number; to: number }
}

const IMAGE_TYPES = new Set(['imageResize', 'image', 'academicImage'])
/** Pictures narrower than this are logos, icons or signatures, not figures. */
const MIN_FIGURE_WIDTH_PX = 120
/** A line this short may sit between a figure and its caption (its title, or a blank). */
const MAX_GAP_LINE = 80

function isImage(node: ProseMirrorNode): boolean {
  return IMAGE_TYPES.has(node.type.name)
}

function isBlankLine(node: ProseMirrorNode): boolean {
  return node.isTextblock && node.textContent.trim().length === 0
}

function widthOf(node: ProseMirrorNode): number | null {
  const style = typeof node.attrs.containerStyle === 'string' ? node.attrs.containerStyle : ''
  const match = /(?:^|;)\s*width:\s*([\d.]+)px/i.exec(style)
  if (match) return Number(match[1])
  const attr = Number(node.attrs.width)
  return Number.isFinite(attr) && attr > 0 ? attr : null
}

/** Alt text that is a file name, a generic word or Word's machine description says nothing the user wrote. */
const GENERIC_ALT = /^(?:picture|image|img|figure|fig\.?|graphic|chart|diagram|screenshot|photo|logo|untitled|placeholder)[\s_-]*\d*$/i
const FILE_NAME = /\.(?:png|jpe?g|gif|bmp|svg|webp|tiff?|emf|wmf)$/i
const MACHINE_DESCRIPTION = /description automatically generated|a picture containing|a screenshot of|a close-up of/i

/** A title from the user's own words, with any "Figure 3:" label in front taken off. */
function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.replace(/\s+/g, ' ').trim()
  const label = CAPTION_LABEL.exec(text)
  if (label) text = text.slice(label[0].length).replace(/^\s*[:.—-]\s*/, '').trim()
  if (text.length < 3 || text.length > 200) return null
  if (GENERIC_ALT.test(text) || FILE_NAME.test(text) || MACHINE_DESCRIPTION.test(text)) return null
  return text
}

function figureTitle(pictures: ProseMirrorNode[]): { title: string | null; titleSource: CaptionTitleSource } {
  for (const picture of pictures) {
    if (picture.attrs.placeholderSlot) {
      const title = cleanTitle(picture.attrs.slotLabel ?? picture.attrs.alt)
      if (title) return { title, titleSource: 'slot label' }
      continue
    }
    const title = cleanTitle(picture.attrs.alt) ?? cleanTitle(picture.attrs.title)
    if (title) return { title, titleSource: 'alt text' }
  }
  return { title: null, titleSource: null }
}

/** A table's first row when it is one cell across the whole table: the table's own title line. */
function titleRow(table: ProseMirrorNode, tablePos: number): { text: string; from: number; to: number } | null {
  // Rows may sit in row groups (thead / tbody) inside the table.
  const rows: Array<{ node: ProseMirrorNode; from: number; parent: ProseMirrorNode }> = []
  table.descendants((node, offset, parent) => {
    if (node.type.name === 'tableRow' && parent) rows.push({ node, from: tablePos + 1 + offset, parent })
    return node.type.name !== 'tableRow'
  })
  const first = rows[0]
  if (!first || first.node.childCount !== 1) return null
  const columns = Math.max(...rows.map((row) => row.node.childCount))
  if (columns > 1 && Number(first.node.firstChild?.attrs.colspan ?? 1) < columns) return null
  const text = first.node.textContent.trim()
  if (!text) return null
  // A row group holding only the title row goes with it (a group cannot be left empty).
  const alone = first.parent.type.name !== 'table' && first.parent.childCount === 1
  const from = alone ? first.from - 1 : first.from
  const to = alone ? first.from + first.node.nodeSize + 1 : first.from + first.node.nodeSize
  return { text, from, to }
}

/** Caption positions by kind, for the neighbour checks. */
function captionPositions(doc: ProseMirrorNode): Map<number, CaptionKind> {
  return new Map(findCaptions(doc).map((entry) => [entry.pos, entry.kind]))
}

interface TopBlock {
  node: ProseMirrorNode
  pos: number
}

/**
 * Claim the caption of `kind` next to blocks[start..end]: right before or right after, with at
 * most one short line (a blank, or the figure's title) between. The side the caption settings put
 * captions on is tried first, and a caption already claimed by the figure before it is not
 * claimed again, so "picture / Figure 1 / picture" leaves the second picture uncaptioned.
 */
function claimCaption(
  blocks: TopBlock[],
  start: number,
  end: number,
  kind: CaptionKind,
  placement: 'top' | 'bottom',
  captions: Map<number, CaptionKind>,
  claimed: Set<number>,
): boolean {
  const captionAt = (index: number): number | null => {
    const block = blocks[index]
    return block && captions.get(block.pos) === kind && !claimed.has(block.pos) ? block.pos : null
  }
  const isGap = (index: number): boolean => {
    const block = blocks[index]
    return Boolean(block) && block.node.isTextblock && block.node.textContent.trim().length <= MAX_GAP_LINE
  }
  const below = (): number | null => captionAt(end + 1) ?? (isGap(end + 1) ? captionAt(end + 2) : null)
  const above = (): number | null => captionAt(start - 1) ?? (isGap(start - 1) ? captionAt(start - 2) : null)
  const found = placement === 'bottom' ? (below() ?? above()) : (above() ?? below())
  if (found === null) return false
  claimed.add(found)
  return true
}

/** Every figure and table of the requested kinds that has no caption, in document order. */
export function planAutoCaptions(doc: ProseMirrorNode, config: CaptionConfig, kinds: readonly CaptionKind[] = ['figure', 'table']): AutoCaptionItem[] {
  const blocks: TopBlock[] = []
  doc.forEach((node, pos) => blocks.push({ node, pos }))
  const captions = captionPositions(doc)
  const claimed = new Set<number>()
  // A thesis's title page and front matter (logo, signatures) come before the first chapter.
  const firstChapter = blocks.findIndex(({ node }) => node.isTextblock && chapterNumber(captionText(node)) !== null && node.textContent.trim().length <= 40)
  const items: AutoCaptionItem[] = []

  for (let index = Math.max(0, firstChapter); index < blocks.length; index += 1) {
    const { node, pos } = blocks[index]

    if (node.type.name === 'table' && kinds.includes('table')) {
      const row = titleRow(node, pos)
      // A first row reading "Table 3: ..." is the table's caption, written inside it.
      if (row && CAPTION_LABEL.test(row.text)) continue
      if (claimCaption(blocks, index, index, 'table', config.table.placement, captions, claimed)) continue
      const title = row ? cleanTitle(row.text) : null
      // The title row moves into the caption, unless it is all the table has.
      const rowCount = (() => {
        let count = 0
        node.descendants((child) => {
          if (child.type.name === 'tableRow') count += 1
          return child.type.name !== 'tableRow'
        })
        return count
      })()
      items.push({
        kind: 'table',
        from: pos,
        to: pos + node.nodeSize,
        insertAt: config.table.placement === 'top' ? pos : pos + node.nodeSize,
        title,
        titleSource: title ? 'title row' : null,
        ...(title && row && rowCount > 1 ? { moveFrom: { from: row.from, to: row.to } } : {}),
      })
      continue
    }

    if (!isImage(node) || !kinds.includes('figure')) continue
    // Pictures stacked together (with blank lines between) are one figure with one caption.
    let end = index
    while (end + 1 < blocks.length && (isImage(blocks[end + 1].node) || (isBlankLine(blocks[end + 1].node) && end + 2 < blocks.length && isImage(blocks[end + 2].node)))) end += 1
    const pictures = blocks.slice(index, end + 1).map((block) => block.node).filter(isImage)
    const groupEnd = blocks[end].pos + blocks[end].node.nodeSize
    const start = index
    index = end
    if (pictures.every((picture) => (widthOf(picture) ?? MIN_FIGURE_WIDTH_PX) < MIN_FIGURE_WIDTH_PX)) continue
    if (claimCaption(blocks, start, end, 'figure', config.figure.placement, captions, claimed)) continue
    items.push({
      kind: 'figure',
      from: blocks[start].pos,
      to: groupEnd,
      insertAt: config.figure.placement === 'top' ? blocks[start].pos : groupEnd,
      ...figureTitle(pictures),
    })
  }
  return items
}

/** A caption whose label has no title after it ("Figure 3." and nothing else). */
export function captionsWithoutTitle(doc: ProseMirrorNode): number[] {
  return findCaptions(doc)
    .filter((entry) => captionText(entry.node).slice(entry.label.length).replace(/[\s.:—-]+/g, '').length === 0)
    .map((entry) => entry.pos)
}
