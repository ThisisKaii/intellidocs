import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

export type CaptionKind = 'figure' | 'table'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captions: {
      /** Insert a numbered caption under the selected image or above the table the caret is in. */
      insertCaption: (kind: CaptionKind) => ReturnType
    }
  }
}

const LABELS: Record<CaptionKind, string> = { figure: 'Figure', table: 'Table' }
const LABEL_PATTERN = /^(Figure|Table)(\s+)(\d+)/
const captionNumbering = new PluginKey('captionNumbering')

interface CaptionEdit {
  pos: number
  from: number
  to: number
  insert: string
}

/**
 * Captions are ordinary paragraphs tagged with `data-caption-kind`. Their
 * "Figure N" / "Table N" prefix is renumbered in document order after every
 * edit, so inserting, deleting or moving an item fixes the rest.
 */
export const CaptionExtension = Extension.create({
  name: 'captions',

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
          const label = `${LABELS[kind]} ${existing + 1}. `
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
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: captionNumbering,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null

          const counters: Record<CaptionKind, number> = { figure: 0, table: 0 }
          const edits: CaptionEdit[] = []
          const unmark: number[] = []
          newState.doc.descendants((node, pos) => {
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
            const number = counters[kind]
            if (Number(match[3]) !== number || match[1] !== LABELS[kind]) {
              const from = pos + 1
              edits.push({ pos, from, to: from + match[0].length, insert: `${LABELS[kind]}${match[2]}${number}` })
            }
            return false
          })
          if (edits.length === 0 && unmark.length === 0) return null

          const tr = newState.tr
          for (const pos of unmark) {
            const node = newState.doc.nodeAt(pos)
            if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, captionKind: null })
          }
          for (const edit of edits.sort((a, b) => b.pos - a.pos)) {
            tr.insertText(edit.insert, edit.from, edit.to)
          }
          return tr
        },
      }),
    ]
  },
})
