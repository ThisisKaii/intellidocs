import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** State stored by the highlight plugin. */
interface HighlightState {
  decorations: DecorationSet
  from: number
  to: number
}

const highlightPluginKey = new PluginKey<HighlightState>('targetHighlight')

/**
 * TipTap extension that decorates a block node with an animated "agentic pulse"
 * highlight (indigo glow border + background, similar to AI IDE suggestions).
 * Uses Decoration.node() so the entire block node is wrapped.
 */
export const TargetHighlightExtension = Extension.create({
  name: 'targetHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: highlightPluginKey,

        state: {
          init(): HighlightState {
            return { decorations: DecorationSet.empty, from: 0, to: 0 }
          },
          apply(tr, prev): HighlightState {
            const meta = tr.getMeta(highlightPluginKey)
            if (meta === 'clear') {
              return { decorations: DecorationSet.empty, from: 0, to: 0 }
            }
            if (meta && typeof meta === 'object' && 'from' in meta) {
              const { from, to } = meta as { from: number; to: number }
              if (from < to && from >= 0 && to <= tr.doc.content.size) {
                // Resolve the block node boundaries for Decoration.node()
                const $from = tr.doc.resolve(from)
                const nodeStart = $from.before($from.depth || 1)
                const nodeEnd = $from.after($from.depth || 1)
                const deco = Decoration.node(nodeStart, nodeEnd, {
                  class: 'agentic-suggestion-pulse',
                })
                return {
                  decorations: DecorationSet.create(tr.doc, [deco]),
                  from,
                  to,
                }
              }
              return { decorations: DecorationSet.empty, from: 0, to: 0 }
            }
            return {
              decorations: prev.decorations.map(tr.mapping, tr.doc),
              from: prev.from,
              to: prev.to,
            }
          },
        },

        props: {
          decorations(state): DecorationSet {
            return highlightPluginKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/**
 * Set the highlight on a document range.
 * `from` and `to` are ProseMirror node positions.
 */
export function setHighlight(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(
    editor.view.state.tr.setMeta(highlightPluginKey, { from, to })
  )
}

/**
 * Clear the current highlight.
 */
export function clearHighlight(editor: Editor): void {
  editor.view.dispatch(
    editor.view.state.tr.setMeta(highlightPluginKey, 'clear')
  )
}
