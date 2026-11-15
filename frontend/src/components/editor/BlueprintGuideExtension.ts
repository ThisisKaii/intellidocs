import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { hasLocalDocChange } from './collabTransactions'
import { changedBlocks, updateDecorations } from './changedRanges'

/** Wrapper class drawn around an unwritten blueprint placeholder. */
const GUIDE_CLASS = 'doc-guide'

/** Attribute holding the standard-reference hint shown inside the guide box. */
const GUIDE_HINT_ATTR = 'guide'

/** Attribute holding the placeholder text, used to detect that it was written over. */
const GUIDE_TEXT_ATTR = 'guideText'

const guideKey = new PluginKey<DecorationSet>('blueprintGuides')

/** Session toggle controlling whether the dashed guide boxes are drawn. */
interface BlueprintGuidesStorage {
  enabled: boolean
}

declare module '@tiptap/core' {
  interface Storage {
    blueprintGuides: BlueprintGuidesStorage
  }

  interface Commands<ReturnType> {
    blueprintGuides: {
      /** Show or hide the dashed blueprint guide boxes. */
      setBlueprintGuidesEnabled: (enabled: boolean) => ReturnType
    }
  }
}

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

/** Guide boxes for the unwritten placeholder blocks between `from` and `to`. */
function guidesBetween(doc: ProseMirrorNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (isOutstandingGuide(node)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: GUIDE_CLASS }))
    }
    return !node.isTextblock
  })
  return decorations
}

/** Build one node decoration per placeholder block that is still unwritten. */
function buildGuides(doc: ProseMirrorNode): DecorationSet {
  return DecorationSet.create(doc, guidesBetween(doc, 0, doc.content.size))
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

  addStorage(): BlueprintGuidesStorage {
    return { enabled: true }
  },

  addCommands() {
    const storage = this.storage
    return {
      setBlueprintGuidesEnabled:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          storage.enabled = enabled
          if (dispatch) {
            dispatch(tr.setMeta(guideKey, { enabled }))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: guideKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, value) {
            const meta = tr.getMeta(guideKey) as { enabled?: boolean } | undefined
            if (typeof meta?.enabled === 'boolean') {
              return meta.enabled ? buildGuides(tr.doc) : DecorationSet.empty
            }
            if (!tr.docChanged) return value
            // Only the blocks an edit touched can have gained or lost a guide.
            return storage.enabled ? updateDecorations(tr, value, guidesBetween) : DecorationSet.empty
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!hasLocalDocChange(transactions)) return null

          // Retire the guide on every placeholder the user has written over (only edited blocks can be).
          const retire: number[] = []
          for (const { from, to } of changedBlocks(transactions, newState.doc)) {
            newState.doc.nodesBetween(from, to, (node, pos) => {
              const hint = node.attrs[GUIDE_HINT_ATTR]
              if (typeof hint === 'string' && hint.length > 0 && !isOutstandingGuide(node)) {
                retire.push(pos)
              }
              return !node.isTextblock
            })
          }

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
