import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** Wrapper class drawn around an unwritten blueprint placeholder. */
const GUIDE_CLASS = 'doc-guide'

/** Attribute holding the standard-reference hint shown inside the guide box. */
const GUIDE_HINT_ATTR = 'guide'

/** Attribute holding the placeholder text, used to detect that it was written over. */
const GUIDE_TEXT_ATTR = 'guideText'

const guideKey = new PluginKey<DecorationSet>('blueprintGuides')

/** True when the node is a blueprint placeholder that still has its original text. */
function isOutstandingGuide(node: ProseMirrorNode): boolean {
  const hint = node.attrs[GUIDE_HINT_ATTR]
  const placeholder = node.attrs[GUIDE_TEXT_ATTR]
  return (
    typeof hint === 'string' &&
    hint.length > 0 &&
    typeof placeholder === 'string' &&
    node.textContent === placeholder
  )
}

/** Build one node decoration per placeholder block that is still unwritten. */
function buildGuides(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (isOutstandingGuide(node)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: GUIDE_CLASS }))
    }
    return true
  })

  return DecorationSet.create(doc, decorations)
}

/**
 * Draws the dashed, non-printing guide boxes that show a student where each
 * element of a document blueprint belongs.
 *
 * The box is a ProseMirror node decoration, so the dashed border is a purely
 * visual layer that never enters the saved HTML. A placeholder stops being a
 * guide the moment its text no longer matches the placeholder, which is
 * detected here and cleared on the node.
 */
export const BlueprintGuideExtension = Extension.create({
  name: 'blueprintGuides',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: guideKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, value) {
            if (!tr.docChanged) return value
            return buildGuides(tr.doc)
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null

          // Retire the guide on every placeholder the user has written over.
          const retire: number[] = []
          newState.doc.descendants((node, pos) => {
            const hint = node.attrs[GUIDE_HINT_ATTR]
            if (typeof hint === 'string' && hint.length > 0 && !isOutstandingGuide(node)) {
              retire.push(pos)
            }
            return true
          })

          if (retire.length === 0) return null

          const tr = newState.tr
          for (const pos of retire) {
            const node = newState.doc.nodeAt(pos)
            if (node) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                [GUIDE_HINT_ATTR]: null,
                [GUIDE_TEXT_ATTR]: null,
              })
            }
          }

          // Attribute cleanup is not a content change, so keep it out of undo.
          tr.setMeta('addToHistory', false)
          return tr
        },
        props: {
          decorations(state) {
            return guideKey.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
