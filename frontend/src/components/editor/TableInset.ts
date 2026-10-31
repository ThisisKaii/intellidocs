import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const insetKey = new PluginKey<DecorationSet>('tableInset')

/** Left, right and top offsets (px) of a table inside the page's text column. */
interface Inset {
  left: number
  right: number
  top: number
}

/** Reads a "left,right,top" attribute value; null when it is missing or not three finite numbers. */
export function parseInset(value: unknown): Inset | null {
  if (typeof value !== 'string') return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  const [left, right, top] = parts
  return left === 0 && right === 0 && top === 0 ? null : { left, right, top }
}

/** The inline style that moves and narrows a table by its inset. */
export function insetStyle(inset: Inset): string {
  const parts = [`margin-left:${inset.left}px`, `width:calc(100% - ${inset.left + inset.right}px)`]
  if (inset.top !== 0) parts.push(`margin-top:${inset.top}px`)
  return parts.join(';')
}

/** One node decoration per table that carries an inset. */
function insetDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    const inset = parseInset(node.attrs.inset)
    if (inset) decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: insetStyle(inset) }))
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Keeps a Word section's own margins on its tables.
 *
 * The editor has one page setup, and the converter moves every block of a section by the difference
 * between the section's margins and that setup. Paragraphs carry the shift as inline style; a table
 * is drawn by a node view whose own style the editor does not keep, so the converter writes
 * `data-inset="left,right,top"` on the table and this extension draws it as a node decoration
 * (a decoration, not a document change: nothing is saved but the attribute).
 */
export const TableInset = Extension.create({
  name: 'tableInset',

  addGlobalAttributes() {
    return [
      {
        types: ['table'],
        attributes: {
          inset: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-inset'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.inset ? { 'data-inset': String(attributes.inset) } : {},
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: insetKey,
        state: {
          init: (_config, state) => insetDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? insetDecorations(tr.doc) : previous),
        },
        props: { decorations: (state) => insetKey.getState(state) },
      }),
    ]
  },
})
