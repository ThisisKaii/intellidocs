import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** A half-open document range [from, to) that should be outlined in the editor. */
export interface OutlineRange {
  from: number
  to: number
}

/** A suggested look drawn over a range without touching the document. */
export interface PreviewSpec extends OutlineRange {
  /** CSS for the text itself (weight, style, size, underline). */
  inlineStyle: string
  /** CSS for the surrounding block (alignment). */
  blockStyle: string
}

interface DecorationRanges {
  /** Pulsing outline marking where a formatting suggestion will land. */
  suggestion: OutlineRange | null
  /** The suggested look, shown until the suggestion is accepted or rejected. */
  preview: PreviewSpec | null
}

interface SuggestionPluginState {
  ranges: DecorationRanges
  decorations: DecorationSet
  /**
   * Per outlined block (by start position): how far below the block's own top its first line
   * sits. Pagination pushes a page's first line down past the page break with floats, while the
   * block's box still starts at the end of the previous page; the outline starts at the first line
   * so it doesn't cover the previous page's bottom margin, the gap and the next header.
   */
  firstLineOffsets: Record<number, number>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestionDecorations: {
      /** Set, or clear with null, the pulsing suggestion outline range. */
      setSuggestionHighlight: (range: OutlineRange | null) => ReturnType
      /** Draw, or clear with null, a before/after preview that never edits the document. */
      setSuggestionPreview: (preview: PreviewSpec | null) => ReturnType
    }
  }
}

/** Wrapper class for the pulsing suggestion outline. */
const SUGGESTION_CLASS = 'agentic-highlight-overlay'
/** Class that shows a suggested alignment while it is previewed. */
const PREVIEW_ALIGN_CLASS = 'suggestion-preview-align'

const suggestionKey = new PluginKey<SuggestionPluginState>('suggestionDecorations')
/** Transaction meta carrying freshly measured first-line offsets. */
const offsetsMeta = 'suggestionOutlineOffsets'

/** Below this the block's first line is where its box starts: nothing to correct. */
const MIN_OFFSET_PX = 4

/** Measure, for each outlined block, how far its first line of text sits below the block's top. */
function measureFirstLineOffsets(view: EditorView): Record<number, number> {
  const out: Record<number, number> = {}
  view.dom.querySelectorAll<HTMLElement>(`.${SUGGESTION_CLASS}`).forEach((el) => {
    let pos: number
    try {
      pos = view.posAtDOM(el, 0) - 1
    } catch {
      return
    }
    const range = document.createRange()
    range.selectNodeContents(el)
    const first = Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0)
    if (!first) return
    const offset = Math.round(first.top - el.getBoundingClientRect().top)
    if (offset >= MIN_OFFSET_PX) out[pos] = offset
  })
  return out
}

function sameOffsets(a: Record<number, number>, b: Record<number, number>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => a[Number(k)] === b[Number(k)])
}

/** Clamp a range to the document, returning null once it no longer covers any text. */
function normalise(range: OutlineRange | null, doc: ProseMirrorNode): OutlineRange | null {
  if (!range) return null
  const max = doc.content.size
  const from = Math.max(0, Math.min(range.from, max))
  const to = Math.max(0, Math.min(range.to, max))
  return to > from ? { from, to } : null
}

/**
 * Compare two outline ranges for equality, treating two absent ranges as equal.
 *
 * The set commands below are called from a transaction listener, so every
 * dispatch re-enters the caller. Without this guard a command that always
 * dispatches would retrigger its own listener until the stack overflows.
 */
function sameRange(a: OutlineRange | null, b: OutlineRange | null): boolean {
  if (a === null || b === null) return a === b
  return a.from === b.from && a.to === b.to
}

/**
 * List the span of every text block the range touches. A node decoration is
 * applied per block so a multi-paragraph range outlines all of its parts.
 */
function blockSpans(doc: ProseMirrorNode, range: OutlineRange): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = []
  doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (node.isTextblock) {
      spans.push({ from: pos, to: pos + node.nodeSize })
      return false
    }
    return true
  })
  return spans
}

/** Build one node decoration per covered block, so each wrapper sits around its own text. */
function buildDecorations(state: EditorState, ranges: DecorationRanges, firstLineOffsets: Record<number, number> = {}): DecorationSet {
  const { doc } = state
  const decorations: Decoration[] = []

  const addOutline = (rawRange: OutlineRange | null, className: string): void => {
    const range = normalise(rawRange, doc)
    if (!range) return
    for (const span of blockSpans(doc, range)) {
      const offset = firstLineOffsets[span.from]
      const attrs: Record<string, string> = { class: className }
      if (offset) attrs.style = `--overlay-top: ${offset}px`
      decorations.push(Decoration.node(span.from, span.to, attrs))
    }
  }

  addOutline(ranges.suggestion, SUGGESTION_CLASS)

  const preview = ranges.preview
  const previewRange = normalise(preview, doc)
  if (preview && previewRange) {
    if (preview.inlineStyle) {
      decorations.push(Decoration.inline(previewRange.from, previewRange.to, { style: preview.inlineStyle }))
    }
    const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(preview.blockStyle)?.[1]
    if (align) {
      // Not a real `text-align` on the block: ProseMirror removes a decoration's style properties
      // from the element when the decoration goes, which also wiped the block's own alignment once
      // the suggestion was accepted (attrs said center, the page showed left). A custom property
      // and a class (see .suggestion-preview-align in index.css) can be removed without touching it.
      for (const span of blockSpans(doc, previewRange)) {
        decorations.push(Decoration.node(span.from, span.to, { class: PREVIEW_ALIGN_CLASS, style: `--preview-text-align: ${align}` }))
      }
    }
  }

  return DecorationSet.create(doc, decorations)
}

/** Move a stored range with the document so typing never leaves an outline behind. */
function mapRange(range: OutlineRange | null, tr: Transaction): OutlineRange | null {
  if (!range) return null
  return { from: tr.mapping.map(range.from, -1), to: tr.mapping.map(range.to, 1) }
}

/**
 * Draws the pending-suggestion outline as a ProseMirror node decoration,
 * which wraps the target block directly in the document DOM. That keeps the
 * outline inside the content flow, so it needs no measured coordinates, no
 * scroll/resize listeners, and cannot render behind the floating suggestion
 * chips, which live in a far higher z-index layer. Selection of ordinary
 * user text never draws outlines.
 */
export const SuggestionDecorationsExtension = Extension.create({
  name: 'suggestionDecorations',

  addCommands() {
    return {
      setSuggestionHighlight:
        (range: OutlineRange | null) =>
        ({ state, tr, dispatch }) => {
          // Store the range clamped to the document so an out-of-bounds range
          // clears the outline instead of persisting unreachable positions.
          const next = normalise(range, state.doc)
          const current = suggestionKey.getState(state)?.ranges.suggestion ?? null
          if (sameRange(current, next)) return true
          tr.setMeta(suggestionKey, { suggestion: next })
          if (dispatch) dispatch(tr)
          return true
        },
      setSuggestionPreview:
        (preview: PreviewSpec | null) =>
        ({ state, tr, dispatch }) => {
          const current = suggestionKey.getState(state)?.ranges.preview ?? null
          if (current === null && preview === null) return true
          tr.setMeta(suggestionKey, { preview })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const key = suggestionKey

    return [
      new Plugin<SuggestionPluginState>({
        key: suggestionKey,
        state: {
          init() {
            return {
              ranges: { suggestion: null, preview: null },
              decorations: DecorationSet.empty,
              firstLineOffsets: {},
            }
          },
          apply(tr, value, _oldState, newState) {
            const offsets = tr.getMeta(offsetsMeta) as Record<number, number> | undefined
            if (offsets) {
              return { ...value, firstLineOffsets: offsets, decorations: buildDecorations(newState, value.ranges, offsets) }
            }
            const meta = tr.getMeta(key) as Partial<DecorationRanges> | undefined
            if (meta) {
              const ranges: DecorationRanges = {
                suggestion: 'suggestion' in meta ? (meta.suggestion ?? null) : value.ranges.suggestion,
                preview: 'preview' in meta ? (meta.preview ?? null) : value.ranges.preview,
              }
              // A new outline is measured afresh (see the plugin view).
              return { ranges, firstLineOffsets: {}, decorations: buildDecorations(newState, ranges) }
            }
            if (tr.docChanged && (value.ranges.suggestion || value.ranges.preview)) {
              const mappedPreview = value.ranges.preview
                ? { ...value.ranges.preview, ...mapRange(value.ranges.preview, tr) }
                : null
              const ranges: DecorationRanges = {
                suggestion: mapRange(value.ranges.suggestion, tr),
                preview: mappedPreview,
              }
              return { ranges, firstLineOffsets: {}, decorations: buildDecorations(newState, ranges) }
            }
            return value
          },
        },
        view: () => ({
          update(view) {
            const current = key.getState(view.state)
            if (!current?.ranges.suggestion) return
            const measured = measureFirstLineOffsets(view)
            if (sameOffsets(measured, current.firstLineOffsets)) return
            // After this update finishes: dispatching from inside update is not allowed.
            queueMicrotask(() => {
              if (view.isDestroyed) return
              const latest = key.getState(view.state)
              if (!latest?.ranges.suggestion || sameOffsets(measured, latest.firstLineOffsets)) return
              view.dispatch(view.state.tr.setMeta(offsetsMeta, measured).setMeta('addToHistory', false))
            })
          },
        }),
        props: {
          // Purely visual: suggestions are reviewed in the side panel, so a click on the
          // outlined text places the caret like anywhere else.
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
