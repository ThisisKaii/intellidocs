import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

import { hasLocalDocChange } from './collabTransactions'
import { changedBlocks } from './changedRanges'
import {
  CAPTION_LABEL,
  captionCounts,
  captionLabel,
  chapterNumber,
  findCaptions,
  labelForNewCaption,
  misnumberedCaptions,
  type CaptionContext,
  type CaptionEntry,
  type CaptionKind,
  type CaptionLabelStyle,
} from './captionNumbering'

export { captionLabel }
export type { CaptionKind, CaptionLabelStyle }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captions: {
      /** Insert a numbered caption under the selected image or above the table the caret is in. */
      insertCaption: (kind: CaptionKind) => ReturnType
      /** Rewrite every caption label to the current label style and renumber in document order. */
      renumberCaptions: () => ReturnType
      /** Choose the label style (set from the document's preset) and apply it. */
      setCaptionLabelStyle: (style: CaptionLabelStyle) => ReturnType
      /** Give the caption block at `pos` the number its place in the document calls for. */
      fixCaptionNumber: (pos: number) => ReturnType
    }
  }

  interface Storage {
    /** `context`: for one tab of a document split into tabs, the captions of the tabs before it. */
    captions: { labelStyle: CaptionLabelStyle; context: CaptionContext | null }
  }
}

const captionNumbering = new PluginKey('captionNumbering')
/** Transaction meta set when a caption was inserted on purpose (the command, not typing). */
const CAPTION_INSERTED = 'captionInserted'

interface CaptionEdit {
  pos: number
  from: number
  to: number
  insert: string
}

/** Caption counts of a document, kept so the plugin can tell when a caption came or went. */
const countsByDoc = new WeakMap<ProseMirrorNode, Record<CaptionKind, number>>()

function countsOf(doc: ProseMirrorNode, entries?: CaptionEntry[]): Record<CaptionKind, number> {
  const cached = countsByDoc.get(doc)
  if (cached) return cached
  const counts = captionCounts(entries ?? findCaptions(doc))
  countsByDoc.set(doc, counts)
  return counts
}

/**
 * Work out what must change so captions read "<label>. text" with the right number and style:
 * label rewrites, and tagged captions whose label was deleted (those stop being captions).
 *
 * Tagged captions are always kept in order. Captions that came with the document ("Figure 3:
 * Comet" in an imported thesis) count towards every number, but their own labels are rewritten
 * only when `includePlain` is set (a caption was inserted or removed), so a caption typed by hand
 * is not renumbered while it is being typed and opening a document never rewrites it.
 */
function planCaptionChanges(
  state: EditorState,
  style: CaptionLabelStyle,
  includePlain: boolean,
  entries: CaptionEntry[] = findCaptions(state.doc),
  context: CaptionContext | null = null,
): { edits: CaptionEdit[]; unmark: number[] } {
  const edits: CaptionEdit[] = []
  const unmark: number[] = []
  const recognised = new Set(entries.map((entry) => entry.pos))
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const kind = node.attrs.captionKind as CaptionKind | null
    // Once the label is deleted the paragraph is ordinary text again, so
    // an emptied caption can be removed like any other paragraph.
    if ((kind === 'figure' || kind === 'table') && !recognised.has(pos)) unmark.push(pos)
    return false
  })
  for (const { entry, expected } of misnumberedCaptions(entries, style, false, context)) {
    if (!entry.tagged && !includePlain) continue
    const from = entry.pos + 1
    edits.push({ pos: entry.pos, from, to: from + entry.label.length, insert: expected })
  }
  return { edits, unmark }
}

/** A block numbering depends on: a caption (tagged or by its label) or a "Chapter N" line. */
function affectsNumbering(node: ProseMirrorNode): boolean {
  if (!node.isTextblock) return false
  if (node.attrs.captionKind) return true
  const text = node.textContent
  return CAPTION_LABEL.test(text) || chapterNumber(text) !== null
}

/** Whether a batch of transactions added, changed or removed anything numbering depends on. */
function touchesCaptions(transactions: readonly Transaction[], doc: ProseMirrorNode): boolean {
  const scan = (node: ProseMirrorNode, from: number, to: number): boolean => {
    let hit = false
    node.nodesBetween(from, to, (child) => {
      if (hit) return false
      if (affectsNumbering(child)) hit = true
      return !hit && !child.isTextblock
    })
    return hit
  }
  // What is there now, in the blocks the edits touched.
  if (changedBlocks(transactions, doc).some(({ from, to }) => scan(doc, from, to))) return true
  // What was taken out (a deleted caption moves every later number).
  return transactions.some((tr) =>
    tr.steps.some((step, index) => {
      let hit = false
      step.getMap().forEach((oldStart, oldEnd) => {
        if (!hit && oldEnd > oldStart) hit = scan(tr.docs[index], oldStart, oldEnd)
      })
      return hit
    }),
  )
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
 * Captions are ordinary paragraphs tagged with `data-caption-kind`, plus the "Figure N" /
 * "Table N" paragraphs a document came with. Labels follow document order (and the document's
 * own scheme: one sequence, chapter numbers, or numbers restarting each chapter), so inserting,
 * deleting or moving an item fixes the rest.
 */
export const CaptionExtension = Extension.create({
  name: 'captions',

  addStorage() {
    return { labelStyle: 'default' as CaptionLabelStyle, context: null as CaptionContext | null }
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

          // Numbered after the captions above it, whether the editor or the original file made them.
          const label = `${labelForNewCaption(state.doc, kind, pos, this.storage.labelStyle, this.storage.context)}. `
          const paragraph = schema.nodes.paragraph.create(
            { captionKind: kind, textAlign: 'center' },
            schema.text(label)
          )
          if (dispatch) {
            tr.insert(pos, paragraph)
            tr.setMeta(CAPTION_INSERTED, true)
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + paragraph.nodeSize - 1)))
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      renumberCaptions:
        () =>
        ({ state, tr, dispatch }) => {
          const plan = planCaptionChanges(state, this.storage.labelStyle, true, undefined, this.storage.context)
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

      fixCaptionNumber:
        (pos: number) =>
        ({ state, tr, dispatch }) => {
          const fix = misnumberedCaptions(findCaptions(state.doc), this.storage.labelStyle, false, this.storage.context).find(({ entry }) => entry.pos === pos)
          if (!fix) return false
          if (dispatch) {
            const from = pos + 1
            dispatch(tr.insertText(fix.expected, from, from + fix.entry.label.length))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key: captionNumbering,
        appendTransaction(transactions, oldState, newState) {
          if (!hasLocalDocChange(transactions)) return null
          // Numbering only moves when an edit touches a caption or a chapter line; skipping the
          // rest keeps typing in a long manuscript from walking every page on each key.
          if (!touchesCaptions(transactions, newState.doc)) return null
          const entries = findCaptions(newState.doc)
          const before = countsOf(oldState.doc)
          const after = countsOf(newState.doc, entries)
          // A caption inserted with the command, or one removed: every caption after it moves, so
          // the document's own captions are renumbered too. Typing a new one by hand is not.
          const inserted = transactions.some((tr) => tr.getMeta(CAPTION_INSERTED) === true)
          const removed = after.figure < before.figure || after.table < before.table
          const plan = planCaptionChanges(newState, storage.labelStyle, inserted || removed, entries, storage.context)
          if (plan.edits.length === 0 && plan.unmark.length === 0) return null
          const tr = newState.tr
          applyCaptionChanges(tr, plan)
          return tr
        },
      }),
    ]
  },
})
