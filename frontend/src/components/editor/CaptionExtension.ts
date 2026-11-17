import { Extension } from '@tiptap/core'
import type { Mark, Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

import { hasLocalDocChange } from './collabTransactions'
import { planAutoCaptions } from './autoCaption'
import { changedBlocks } from './changedRanges'
import {
  CAPTION_LABEL,
  captionCounts,
  captionLabel,
  captionText,
  chapterNumber,
  findCaptions,
  labelForNewCaption,
  misnumberedCaptions,
  type CaptionContext,
  type CaptionEntry,
  type CaptionKind,
  type CaptionKindConfig,
  type CaptionLabelStyle,
  type CaptionStyleSpec,
  resolveCaptionConfig,
} from './captionNumbering'

export { captionLabel }
export type { CaptionKind, CaptionLabelStyle, CaptionStyleSpec }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captions: {
      /**
       * Insert a numbered caption for the selected image or the table the caret is in, where the
       * document's caption settings put it (above or below), written in their label and typography.
       */
      insertCaption: (kind: CaptionKind) => ReturnType
      /**
       * Caption every figure and table of these kinds that has none, in one step: numbered, in the
       * caption style, with a title only where the document already has one (alt text, slot label,
       * a table's title row). False when there is nothing to caption.
       */
      insertAutoCaptions: (kinds?: CaptionKind[]) => ReturnType
      /** Rewrite every caption label to the current label style and renumber in document order. */
      renumberCaptions: () => ReturnType
      /** Choose the caption style (from the preset, or Page Setup → Captions) and relabel to it. */
      setCaptionLabelStyle: (style: CaptionStyleSpec) => ReturnType
      /** Give the caption block at `pos` the number its place in the document calls for. */
      fixCaptionNumber: (pos: number) => ReturnType
    }
  }

  interface Storage {
    /** `context`: for one tab of a document split into tabs, the captions of the tabs before it. */
    captions: { labelStyle: CaptionStyleSpec; context: CaptionContext | null }
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
  style: CaptionStyleSpec,
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
  const text = captionText(node)
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

/**
 * A caption paragraph: its label (bold where the style asks), the separator, and the title if
 * there is one, all in the caption's font and size. `titleMarks` are the marks a title typed
 * after it should carry (italic where the style asks).
 */
function captionParagraph(
  schema: Schema,
  config: CaptionKindConfig,
  kind: CaptionKind,
  label: string,
  title: string | null,
): { paragraph: ProseMirrorNode; titleMarks: Mark[] } {
  const textStyle = schema.marks.textStyle && (config.fontSize || config.fontFamily)
    ? [schema.marks.textStyle.create({ fontSize: config.fontSize || null, fontFamily: config.fontFamily || null })]
    : []
  const labelMarks = config.boldLabel && schema.marks.bold ? [...textStyle, schema.marks.bold.create()] : textStyle
  const titleMarks = config.italicText && schema.marks.italic ? [...textStyle, schema.marks.italic.create()] : textStyle
  const content = [schema.text(label, labelMarks)]
  if (config.separator === 'line' && schema.nodes.hardBreak) content.push(schema.nodes.hardBreak.create())
  else content.push(schema.text(config.separator === 'line' ? '. ' : config.separator, textStyle))
  if (title) content.push(schema.text(title, titleMarks))
  return { paragraph: schema.nodes.paragraph.create({ captionKind: kind, textAlign: config.alignment }, content), titleMarks }
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
    return { labelStyle: 'default' as CaptionStyleSpec, context: null as CaptionContext | null }
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
          const config = resolveCaptionConfig(this.storage.labelStyle)[kind]
          const $from = selection.$from
          let pos: number
          if (selection instanceof NodeSelection && $from.depth === 0) {
            // A block-level image (or a selected table): the caption goes above or below it.
            pos = config.placement === 'bottom' ? selection.to : selection.from
          } else if (kind === 'table') {
            let tableStart = -1
            let tableEnd = -1
            for (let depth = $from.depth; depth >= 1; depth -= 1) {
              if ($from.node(depth).type.name === 'table') {
                tableStart = $from.before(depth)
                tableEnd = $from.after(depth)
              }
            }
            if (tableStart < 0 && $from.depth < 1) return false
            pos = tableStart < 0 ? $from.before(1) : config.placement === 'top' ? tableStart : tableEnd
          } else {
            if ($from.depth < 1) return false
            pos = $from.after(1)
          }

          // Numbered after the captions above it, whether the editor or the original file made them.
          const label = labelForNewCaption(state.doc, kind, pos, this.storage.labelStyle, this.storage.context)
          const { paragraph, titleMarks } = captionParagraph(schema, config, kind, label, null)
          if (dispatch) {
            tr.insert(pos, paragraph)
            tr.setMeta(CAPTION_INSERTED, true)
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + paragraph.nodeSize - 1)))
            // The title typed next: in the caption's size, and in italics where the style asks.
            tr.setStoredMarks(titleMarks)
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      insertAutoCaptions:
        (kinds: CaptionKind[] = ['figure', 'table']) =>
        ({ state, tr, dispatch }) => {
          const config = resolveCaptionConfig(this.storage.labelStyle)
          const items = planAutoCaptions(state.doc, config, kinds)
          if (items.length === 0) return false
          if (dispatch) {
            // Last to first, so earlier positions stay valid. Each gets a placeholder number: the
            // numbering plugin renumbers every caption in document order once they are all in.
            for (const item of [...items].reverse()) {
              const label = captionLabel(item.kind, 1, this.storage.labelStyle)
              const paragraph = captionParagraph(state.schema, config[item.kind], item.kind, label, item.title).paragraph
              // A table's title row moves into its caption. Whichever change comes later in the
              // document goes first, so the other's position still holds.
              const moved = item.moveFrom
              if (moved && moved.from >= item.insertAt) tr.delete(moved.from, moved.to)
              tr.insert(item.insertAt, paragraph)
              if (moved && moved.from < item.insertAt) tr.delete(moved.from, moved.to)
            }
            tr.setMeta(CAPTION_INSERTED, true)
            dispatch(tr)
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
        (style: CaptionStyleSpec) =>
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
