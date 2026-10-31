import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { spanFlags, type CaptionKind } from './ieeeSpan'

/** Node types that can run across both columns of an IEEE paper. */
const SPAN_TYPES = ['table', 'imageResize', 'blockMath']

const spanKey = new PluginKey<DecorationSet>('fullSpan')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fullSpan: {
      /** Make the selected table, figure or display equation run across both columns, or back into one. */
      toggleFullSpan: () => ReturnType
    }
  }
}

/** The table, figure or equation the selection is in or on, with its position, or null. */
export function spanTarget(state: EditorState): { pos: number; node: ProseMirrorNode } | null {
  const { selection } = state
  if (selection instanceof NodeSelection && SPAN_TYPES.includes(selection.node.type.name)) {
    return { pos: selection.from, node: selection.node }
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (SPAN_TYPES.includes(node.type.name)) return { pos: $from.before(depth), node }
  }
  return null
}

/** The caption kind of a top-level block, or null. */
function captionKind(node: ProseMirrorNode): CaptionKind | null {
  const kind = node.type.name === 'paragraph' ? node.attrs.captionKind : null
  return kind === 'figure' || kind === 'table' ? kind : null
}

/** One node decoration per top-level block that runs across both columns (the marked block and its caption). */
function spanDecorations(doc: ProseMirrorNode): DecorationSet {
  const items: Array<{ pos: number; node: ProseMirrorNode }> = []
  doc.forEach((node, offset) => items.push({ pos: offset, node }))
  const flags = spanFlags(items.map(({ node }) => ({ span: node.attrs.span === 'full', caption: captionKind(node) })))
  const decorations = items.flatMap(({ pos, node }, index) =>
    flags[index] ? [Decoration.node(pos, pos + node.nodeSize, { class: 'ieee-span' })] : [],
  )
  return DecorationSet.create(doc, decorations)
}

/**
 * Lets a table, figure or display equation run across both columns of an IEEE paper.
 *
 * The choice is a node attribute (`data-span="full"` in the saved HTML). The two-column draft view draws
 * it with a node decoration class, so nothing but the attribute is saved. The print preview and the Word
 * export read the same attribute (see ieeeSpan.ts).
 */
export const FullSpan = Extension.create({
  name: 'fullSpan',

  addGlobalAttributes() {
    return [
      {
        types: SPAN_TYPES,
        attributes: {
          span: {
            default: null,
            parseHTML: (element: HTMLElement) => (element.getAttribute('data-span') === 'full' ? 'full' : null),
            renderHTML: (attributes: Record<string, unknown>) => (attributes.span === 'full' ? { 'data-span': 'full' } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      toggleFullSpan:
        () =>
        ({ state, tr, dispatch }) => {
          const target = spanTarget(state)
          if (!target) return false
          if (dispatch) {
            const next = target.node.attrs.span === 'full' ? null : 'full'
            tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, span: next })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: spanKey,
        state: {
          init: (_config, state) => spanDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? spanDecorations(tr.doc) : previous),
        },
        props: { decorations: (state) => spanKey.getState(state) },
      }),
    ]
  },
})
