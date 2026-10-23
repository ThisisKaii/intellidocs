import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnsDraft: {
      /** Turns the IEEE two-column draft view on or off (the caller also toggles pagination). */
      setColumnsDraft: (active: boolean) => ReturnType
    }
  }
}

const draftKey = new PluginKey<boolean>('columnsDraft')

/**
 * Marks the leading blocks of an IEEE paper (title, authors, abstract, index
 * terms) so the draft view can span them across both columns.
 */
function frontMatterDecorations(doc: import('@tiptap/pm/model').Node): DecorationSet {
  const decorations: Decoration[] = []
  let end = -1
  doc.forEach((node, _offset, index) => {
    if (end < 0 && /^\s*index terms/i.test(node.textContent)) {
      end = index
    }
  })
  if (end < 0) {
    // No index terms: the front matter ends before the first non-title heading.
    doc.forEach((node, _offset, index) => {
      if (end < 0 && index > 0 && node.type.name === 'heading' && node.attrs.docRole !== 'title') {
        end = index - 1
      }
    })
  }
  doc.forEach((node, offset, index) => {
    if (index <= end) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'ieee-front' }))
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * View-only "Two-column draft": flags the editor so CSS can show an IEEE body in
 * two columns on one long sheet. It never changes the document.
 */
export const ColumnsDraft = Extension.create({
  name: 'columnsDraft',

  addCommands() {
    return {
      setColumnsDraft:
        (active: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(draftKey, active).setMeta('addToHistory', false))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: draftKey,
        state: {
          init: () => false,
          apply: (tr, value) => {
            const meta = tr.getMeta(draftKey) as boolean | undefined
            return meta === undefined ? value : meta
          },
        },
        props: {
          attributes: (state): Record<string, string> =>
            draftKey.getState(state) ? { class: 'ieee-columns-draft' } : {},
          decorations: (state) =>
            draftKey.getState(state) ? frontMatterDecorations(state.doc) : DecorationSet.empty,
        },
      }),
    ]
  },
})
