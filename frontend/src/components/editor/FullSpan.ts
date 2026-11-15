import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { spanFlags, type CaptionKind } from './ieeeSpan'
import { updateDecorations } from './changedRanges'

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

/**
 * Span decorations for the top-level blocks between `from` and `to`. Whether a caption spans
 * depends on its neighbours, so the flags are worked out over a few blocks either side.
 */
function spansBetween(doc: ProseMirrorNode, from: number, to: number): Decoration[] {
  const first = doc.resolve(from).index(0)
  const last = doc.resolve(to).index(0)
  // One block either side is read too: a caption spans when the block next to it does.
  const items: Array<{ pos: number; node: ProseMirrorNode; index: number }> = []
  let pos = doc.resolve(from).posAtIndex(Math.max(0, first - 1), 0)
  for (let index = Math.max(0, first - 1); index < Math.min(doc.childCount, last + 1); index += 1) {
    const node = doc.child(index)
    items.push({ pos, node, index })
    pos += node.nodeSize
  }
  const flags = spanFlags(items.map(({ node }) => ({ span: node.attrs.span === 'full', caption: captionKind(node) })))
  return items.flatMap(({ pos: at, node, index }, i) =>
    flags[i] && index >= first && index < last ? [Decoration.node(at, at + node.nodeSize, { class: 'ieee-span' })] : [],
  )
}

/** One node decoration per top-level block that runs across both columns (the marked block and its caption). */
function spanDecorations(doc: ProseMirrorNode): DecorationSet {
  return DecorationSet.create(doc, spansBetween(doc, 0, doc.content.size))
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
          // The changed blocks and one either side (a neighbour's span decides a caption's).
          apply: (tr, previous) => (tr.docChanged ? updateDecorations(tr, previous, spansBetween, 1) : previous),
        },
        props: { decorations: (state) => spanKey.getState(state) },
      }),
    ]
  },
})
