import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

import { toRoman } from './ieeeNumbering'

export type CaptionKind = 'figure' | 'table'

/** How caption labels read: "Figure 1" / "Table 1", or IEEE's "Fig. 1" / "TABLE I". */
export type CaptionLabelStyle = 'default' | 'ieee'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captions: {
      /** Insert a numbered caption under the selected image or above the table the caret is in. */
      insertCaption: (kind: CaptionKind) => ReturnType
      /** Rewrite every caption label to the current label style and renumber in document order. */
      renumberCaptions: () => ReturnType
      /** Choose the label style (set from the document's preset) and apply it. */
      setCaptionLabelStyle: (style: CaptionLabelStyle) => ReturnType
    }
  }

  interface Storage {
    captions: { labelStyle: CaptionLabelStyle }
  }
}

/** Any caption label a user may have: Figure, Fig., Table or TABLE, then an Arabic or Roman number. */
const LABEL_PATTERN = /^(Figure|Fig\.|Table|TABLE)(\s+)(\d+|[IVXLCDM]+)(?![A-Za-z])/
const captionNumbering = new PluginKey('captionNumbering')

/** The label text for caption number `number` of a kind, in the given style (without a trailing period). */
export function captionLabel(kind: CaptionKind, number: number, style: CaptionLabelStyle): string {
  if (style === 'ieee') {
    return kind === 'figure' ? `Fig. ${number}` : `TABLE ${toRoman(number)}`
  }
  return kind === 'figure' ? `Figure ${number}` : `Table ${number}`
}

interface CaptionEdit {
  pos: number
  from: number
  to: number
  insert: string
}

/**
 * Work out what must change so every caption reads "<label>. text" with the
 * right number and style: label rewrites, and captions whose label was deleted
 * (those stop being captions).
 */
function planCaptionChanges(state: EditorState, style: CaptionLabelStyle): { edits: CaptionEdit[]; unmark: number[] } {
  const counters: Record<CaptionKind, number> = { figure: 0, table: 0 }
  const edits: CaptionEdit[] = []
  const unmark: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true
    const kind = node.attrs.captionKind as CaptionKind | null
    if (kind !== 'figure' && kind !== 'table') return false
    const match = LABEL_PATTERN.exec(node.textContent)
    // Once the label is deleted the paragraph is ordinary text again, so
    // an emptied caption can be removed like any other paragraph.
    if (!match) {
      unmark.push(pos)
      return false
    }
    counters[kind] += 1
    const expected = captionLabel(kind, counters[kind], style)
    if (match[0] !== expected) {
      const from = pos + 1
      edits.push({ pos, from, to: from + match[0].length, insert: expected })
    }
    return false
  })
  return { edits, unmark }
}

/** Apply planned caption changes to a transaction, last to first so positions stay valid. */
function applyCaptionChanges(tr: Transaction, plan: { edits: CaptionEdit[]; unmark: number[] }): void {
  for (const pos of plan.unmark) {
    const node = tr.doc.nodeAt(pos)
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, captionKind: null })
  }
  for (const edit of plan.edits.sort((a, b) => b.pos - a.pos)) {
    tr.insertText(edit.insert, edit.from, edit.to)
  }
}

/**
 * Captions are ordinary paragraphs tagged with `data-caption-kind`. Their
 * label ("Figure N" / "Table N", or IEEE's "Fig. N" / "TABLE N") is renumbered
 * in document order after every edit, so inserting, deleting or moving an item
 * fixes the rest.
 */
export const CaptionExtension = Extension.create({
  name: 'captions',

  addStorage() {
    return { labelStyle: 'default' as CaptionLabelStyle }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          captionKind: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-caption-kind'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.captionKind ? { 'data-caption-kind': String(attributes.captionKind) } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      insertCaption:
        (kind: CaptionKind) =>
        ({ state, tr, dispatch }) => {
          const { selection, schema } = state
          const $from = selection.$from
          let pos: number
          if (selection instanceof NodeSelection && $from.depth === 0) {
            // A block-level image: caption goes right below it.
            pos = kind === 'figure' ? selection.to : selection.from
          } else if (kind === 'table') {
            let tableStart = -1
            for (let depth = $from.depth; depth >= 1; depth -= 1) {
              if ($from.node(depth).type.name === 'table') tableStart = $from.before(depth)
            }
            if (tableStart < 0 && $from.depth < 1) return false
            pos = tableStart >= 0 ? tableStart : $from.before(1)
          } else {
            if ($from.depth < 1) return false
            pos = $from.after(1)
          }

          let existing = 0
          state.doc.descendants((node) => {
            if (node.type.name === 'paragraph' && node.attrs.captionKind === kind) existing += 1
            return true
          })
          const label = `${captionLabel(kind, existing + 1, this.storage.labelStyle)}. `
          const paragraph = schema.nodes.paragraph.create(
            { captionKind: kind, textAlign: 'center' },
            schema.text(label)
          )
          if (dispatch) {
            tr.insert(pos, paragraph)
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + paragraph.nodeSize - 1)))
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      renumberCaptions:
        () =>
        ({ state, tr, dispatch }) => {
          const plan = planCaptionChanges(state, this.storage.labelStyle)
          if (plan.edits.length === 0 && plan.unmark.length === 0) return true
          if (dispatch) {
            applyCaptionChanges(tr, plan)
            dispatch(tr)
          }
          return true
        },

      setCaptionLabelStyle:
        (style: CaptionLabelStyle) =>
        ({ commands }) => {
          this.storage.labelStyle = style
          return commands.renumberCaptions()
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key: captionNumbering,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const plan = planCaptionChanges(newState, storage.labelStyle)
          if (plan.edits.length === 0 && plan.unmark.length === 0) return null
          const tr = newState.tr
          applyCaptionChanges(tr, plan)
          return tr
        },
      }),
    ]
  },
})
