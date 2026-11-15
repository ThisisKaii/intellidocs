import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

import { findCaptions, misnumberedCaptions, type CaptionLabelStyle } from '@/components/editor/captionNumbering'

/**
 * Where figures sit, and whether their captions are numbered right.
 *
 * A thesis figure stands on its own line, centered, between its title and its "Figure N:" caption.
 * Text wrapped beside a picture (Word's "square" wrapping, imported as a wrap block), a figure set
 * to one side while the others are centered, and a caption number that does not follow from its
 * place are all found here, with the change that puts each right.
 */

export const UNWRAP_FIGURE = 'figure_unwrap'
export const CENTER_FIGURE = 'figure_center'
export const FIX_CAPTION_NUMBER = 'caption_number'

export type FigureIssueKind = typeof UNWRAP_FIGURE | typeof CENTER_FIGURE | typeof FIX_CAPTION_NUMBER

export interface FigureIssue {
  kind: FigureIssueKind
  /** The block to change: a wrap block, an image or a caption. */
  from: number
  to: number
  /** Card wording. */
  label: string
  detail: string
  /** Text naming the place ("Figure 2: Comet"). */
  preview: string
}

const IMAGE_TYPES = new Set(['imageResize', 'image'])
const FIGURE_CAPTION = /^(figure|fig\.)\s+\d/i

function isImage(node: ProseMirrorNode | null | undefined): boolean {
  return !!node && IMAGE_TYPES.has(node.type.name)
}

function isBlank(node: ProseMirrorNode): boolean {
  return node.isTextblock && node.textContent.trim().length === 0
}

function isFigureCaption(node: ProseMirrorNode): boolean {
  return node.isTextblock && FIGURE_CAPTION.test(node.textContent.trim())
}

function styleOf(node: ProseMirrorNode): string {
  return typeof node.attrs.containerStyle === 'string' ? node.attrs.containerStyle : ''
}

/** A picture within this many px of the widest one fills the column (they differ by rounding). */
const FULL_WIDTH_SLACK_PX = 8
/** Below this a picture never fills a page's text column, however wide the widest one is. */
const MIN_FULL_WIDTH_PX = 400

/** The picture's drawn width in px, from its wrapper style or width attribute. */
function widthOf(node: ProseMirrorNode): number | null {
  const match = /(?:^|;)\s*width:\s*([\d.]+)px/i.exec(styleOf(node))
  if (match) return Number(match[1])
  const attr = Number(node.attrs.width)
  return Number.isFinite(attr) && attr > 0 ? attr : null
}

function isFloated(node: ProseMirrorNode): boolean {
  return /float:\s*(left|right)/i.test(styleOf(node)) || node.attrs.alignment === 'float' || /^wrap-(left|right)$/.test(String(node.attrs.wrapMode ?? ''))
}

/** Alignment an image is drawn with: its attribute, else what its wrapper margins do. */
function alignmentOf(node: ProseMirrorNode): 'left' | 'center' | 'right' {
  const value = node.attrs.alignment
  if (value === 'left' || value === 'right' || value === 'center') return value
  const style = styleOf(node)
  if (/margin:\s*0 0 0 auto/.test(style)) return 'right'
  if (/margin:\s*0 auto 0 0/.test(style)) return 'left'
  return 'center'
}

/** The figure's caption: the "Figure N" line right below the picture, or right above it. */
function captionNear(parent: ProseMirrorNode, index: number): ProseMirrorNode | null {
  const at = (i: number): ProseMirrorNode | null => (i >= 0 && i < parent.childCount ? parent.child(i) : null)
  for (const direction of [1, -1]) {
    const next = at(index + direction)
    if (!next) continue
    if (isFigureCaption(next)) return next
    // One short line (a blank or the figure's title) may sit between picture and caption.
    const after = at(index + 2 * direction)
    if (after && next.textContent.trim().length <= 80 && isFigureCaption(after)) return after
  }
  return null
}

function nameOf(caption: ProseMirrorNode | null, fallback: string): string {
  const text = caption?.textContent.trim() ?? ''
  return text ? text.slice(0, 60) : fallback
}

/** Every figure placement problem and misnumbered caption, in document order. */
export function findFigureIssues(doc: ProseMirrorNode, labelStyle: CaptionLabelStyle = 'default'): FigureIssue[] {
  const issues: FigureIssue[] = []
  const standalone: Array<{ node: ProseMirrorNode; pos: number; caption: ProseMirrorNode | null }> = []

  doc.forEach((node, offset, index) => {
    if (node.type.name === 'wrapBlock') {
      let caption: ProseMirrorNode | null = null
      let hasPicture = false
      node.forEach((child) => {
        if (isImage(child)) hasPicture = true
        else if (!caption && isFigureCaption(child)) caption = child
      })
      if (!hasPicture) return
      if (!caption) {
        for (let back = index - 1; back >= Math.max(0, index - 3); back -= 1) {
          const previous = doc.child(back)
          if (isFigureCaption(previous)) {
            caption = previous
            break
          }
        }
      }
      const name = nameOf(caption, 'figure')
      issues.push({
        kind: UNWRAP_FIGURE,
        from: offset,
        to: offset + node.nodeSize,
        label: `Put ${caption ? `“${name}”` : 'the figure'} on its own line`,
        detail: 'Text is wrapped beside this picture; figures stand alone, centered, above their caption',
        preview: name,
      })
      return
    }
    if (!isImage(node)) return
    const caption = captionNear(doc, index)
    if (isFloated(node)) {
      const name = nameOf(caption, 'figure')
      issues.push({
        kind: UNWRAP_FIGURE,
        from: offset,
        to: offset + node.nodeSize,
        label: `Put ${caption ? `“${name}”` : 'the figure'} on its own line`,
        detail: 'Text is wrapped beside this picture; figures stand alone, centered, above their caption',
        preview: name,
      })
      return
    }
    if (caption) standalone.push({ node, pos: offset, caption })
  })

  // Captioned figures follow the document's usual alignment; with no clear usual one, centered.
  // A picture as wide as the text column looks the same however it is aligned: never flagged.
  const widest = Math.max(0, ...standalone.map((figure) => widthOf(figure.node) ?? 0))
  const fillsColumn = (node: ProseMirrorNode): boolean => {
    const width = widthOf(node)
    return width !== null && widest > 0 && width >= widest - FULL_WIDTH_SLACK_PX && width >= MIN_FULL_WIDTH_PX
  }
  const centered = standalone.filter((figure) => alignmentOf(figure.node) === 'center').length
  if (centered * 2 >= standalone.length) {
    for (const figure of standalone) {
      if (alignmentOf(figure.node) === 'center' || fillsColumn(figure.node)) continue
      const name = nameOf(figure.caption, 'figure')
      issues.push({
        kind: CENTER_FIGURE,
        from: figure.pos,
        to: figure.pos + figure.node.nodeSize,
        label: `Center “${name}”`,
        detail: `The picture is set ${alignmentOf(figure.node)}; the other figures are centered`,
        preview: name,
      })
    }
  }

  for (const { entry, expected } of misnumberedCaptions(findCaptions(doc), labelStyle)) {
    issues.push({
      kind: FIX_CAPTION_NUMBER,
      from: entry.pos,
      to: entry.pos + entry.node.nodeSize,
      label: `Renumber ${entry.label} as ${expected}`,
      detail: `The ${entry.kind === 'figure' ? 'figures' : 'tables'} before it make this ${expected}`,
      preview: entry.node.textContent.slice(0, 60),
    })
  }

  return issues.sort((a, b) => a.from - b.from)
}

/** The image's wrapper style for a centered picture, keeping its width. */
export function centeredImageStyle(style: string): string {
  const width = /(?:^|;)\s*width:\s*([\d.]+)px/i.exec(style)
  return width ? `width: ${width[1]}px; height: auto; cursor: pointer; margin: 0 auto;` : 'cursor: pointer; margin: 0 auto;'
}

function centeredImage(node: ProseMirrorNode): ProseMirrorNode {
  const attrs: Record<string, unknown> = { ...node.attrs }
  if ('alignment' in attrs) attrs.alignment = 'center'
  if ('containerStyle' in attrs) attrs.containerStyle = centeredImageStyle(styleOf(node))
  if ('wrapMode' in attrs) attrs.wrapMode = null
  return node.type.create(attrs, node.content, node.marks)
}

/**
 * The change that stands a wrapped figure on its own centered line, or null when the block at
 * `from` is no longer one. The picture goes just above its caption (after the figure's title),
 * so "Comet" / picture / "Figure 2: Comet" reads in the usual order; with no caption it opens
 * the text it was wrapped in.
 */
export function unwrapFigure(state: EditorState, from: number): Transaction | null {
  const node = state.doc.nodeAt(from)
  if (!node) return null
  const tr = state.tr
  if (isImage(node)) {
    if (!isFloated(node)) return null
    return tr.replaceWith(from, from + node.nodeSize, centeredImage(node))
  }
  if (node.type.name !== 'wrapBlock') return null
  const pictures: ProseMirrorNode[] = []
  const rest: ProseMirrorNode[] = []
  node.forEach((child) => (isImage(child) ? pictures.push(centeredImage(child)) : rest.push(child)))
  if (pictures.length === 0) return null

  const captionIndex = rest.findIndex(isFigureCaption)
  if (captionIndex >= 0) {
    rest.splice(captionIndex, 0, ...pictures)
    return tr.replaceWith(from, from + node.nodeSize, rest)
  }
  // The caption just above the wrapped text (the figure's title and caption came first).
  const $from = state.doc.resolve(from)
  const parent = $from.parent
  const index = $from.index()
  for (let back = index - 1; back >= Math.max(0, index - 3); back -= 1) {
    const previous = parent.child(back)
    if (isFigureCaption(previous)) {
      let captionPos = $from.start()
      for (let i = 0; i < back; i += 1) captionPos += parent.child(i).nodeSize
      // Only when nothing pictures it already: a caption with an image right above is taken.
      if (back > 0 && isImage(parent.child(back - 1))) break
      tr.replaceWith(from, from + node.nodeSize, rest)
      return tr.insert(captionPos, pictures)
    }
    if (!isBlank(previous) && previous.textContent.length > 80) break
  }
  return tr.replaceWith(from, from + node.nodeSize, [...pictures, ...rest])
}

/** The change that centers the picture at `from`, or null when it is not a picture. */
export function centerFigure(state: EditorState, from: number): Transaction | null {
  const node = state.doc.nodeAt(from)
  if (!node || !isImage(node)) return null
  return state.tr.replaceWith(from, from + node.nodeSize, centeredImage(node))
}
