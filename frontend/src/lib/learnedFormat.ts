import type { Transaction } from '@tiptap/pm/state'
import { mergeStyleDecls } from './inlineStyle'

/** A learned or consistency fix, as the scanner and the learned-format chip carry it. */
export interface LearnedFormatSpec {
  format: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Size in pt; null drops an explicit size so the usual inherited size shows. */
  fontSize?: number | null
  textAlign?: string
  /** Block CSS to merge into each block's inline style (line-height, text-indent, margins). */
  blockStyle?: Record<string, string>
}

const HEADING_LEVELS: Record<string, number> = { heading1: 1, h1: 1, heading2: 2, h2: 2, heading3: 3, h3: 3 }
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])

/**
 * Add one fix's steps to a transaction: marks, font size, block style, heading
 * level and alignment over a block range. Every step keeps positions as they
 * are, so several ranges can go into ONE transaction (one undo step) using the
 * positions of the document the ranges were read from.
 *
 * Returns false when the fix needs a quote block, which wraps content and so
 * cannot share a transaction this way; the caller applies that separately.
 */
export function addLearnedFormatSteps(tr: Transaction, spec: LearnedFormatSpec, range: { from: number; to: number }): boolean {
  if (spec.format === 'blockquote') return false
  const { schema } = tr.doc.type
  const { from, to } = range

  // Marks go over the text inside the blocks (a range from block edge to block edge
  // starts outside the text), matching what a manual selection would cover.
  const textFrom = tr.doc.resolve(from).depth === 0 ? from + 1 : from
  const textTo = Math.max(textFrom, tr.doc.resolve(to).depth === 0 ? to - 1 : to)

  for (const [wanted, markName] of [[spec.bold, 'bold'], [spec.italic, 'italic'], [spec.underline, 'underline']] as const) {
    const type = schema.marks[markName]
    if (!type) continue
    if (wanted === true) tr.addMark(textFrom, textTo, type.create())
    // An explicit false (consistency fix) takes a stray bold or italic off.
    if (wanted === false) tr.removeMark(textFrom, textTo, type)
  }

  const styleType = schema.marks.textStyle
  if (styleType && (typeof spec.fontSize === 'number' || spec.fontSize === null)) {
    tr.doc.nodesBetween(textFrom, textTo, (node, pos) => {
      if (!node.isText) return true
      const existing = node.marks.find((mark) => mark.type === styleType)
      const start = Math.max(pos, textFrom)
      const end = Math.min(pos + node.nodeSize, textTo)
      if (typeof spec.fontSize === 'number' && spec.fontSize > 0) {
        // Size merges into the run's own text style, so its font family survives.
        tr.addMark(start, end, styleType.create({ ...(existing?.attrs ?? {}), fontSize: `${spec.fontSize}pt` }))
      } else if (spec.fontSize === null && existing?.attrs?.fontSize) {
        tr.addMark(start, end, styleType.create({ ...existing.attrs, fontSize: '' }))
      }
      return false
    })
  }

  const level = HEADING_LEVELS[spec.format]
  const headingType = schema.nodes.heading
  const align = spec.textAlign && ALIGNMENTS.has(spec.textAlign) ? spec.textAlign : null
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const type = level && headingType ? headingType : node.type
    const attrs: Record<string, unknown> = { ...node.attrs }
    if (level && headingType) attrs.level = level
    if (align && 'textAlign' in (type.spec.attrs ?? {})) attrs.textAlign = align
    if (spec.blockStyle && Object.keys(spec.blockStyle).length > 0 && 'style' in (type.spec.attrs ?? {})) {
      attrs.style = mergeStyleDecls(node.attrs.style as string | null, spec.blockStyle)
    }
    const changed = type !== node.type || Object.keys(attrs).some((key) => attrs[key] !== node.attrs[key])
    if (changed) tr.setNodeMarkup(pos, type, attrs)
    return false
  })
  return true
}
