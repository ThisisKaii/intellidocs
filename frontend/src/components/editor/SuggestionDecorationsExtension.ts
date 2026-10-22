import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

/** A half-open document range [from, to) that should be outlined in the editor. */
export interface OutlineRange {
  from: number
  to: number
}

interface DecorationRanges {
  /** Pulsing outline marking where a formatting suggestion will land. */
  suggestion: OutlineRange | null
}

interface SuggestionPluginState {
  ranges: DecorationRanges
  decorations: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestionDecorations: {
      /** Set, or clear with null, the pulsing suggestion outline range. */
      setSuggestionHighlight: (range: OutlineRange | null) => ReturnType
    }
  }

  interface EditorEvents {
    /** Fired when the pulsing suggestion outline is clicked; rect is in viewport space. */
    'suggestion-overlay-click': { range: OutlineRange; rect: DOMRect }
  }
}

/** Wrapper class for the pulsing suggestion outline. */
const SUGGESTION_CLASS = 'agentic-highlight-overlay'

const suggestionKey = new PluginKey<SuggestionPluginState>('suggestionDecorations')

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
function buildDecorations(state: EditorState, ranges: DecorationRanges): DecorationSet {
  const { doc } = state
  const decorations: Decoration[] = []

  const addOutline = (rawRange: OutlineRange | null, className: string): void => {
    const range = normalise(rawRange, doc)
    if (!range) return
    for (const span of blockSpans(doc, range)) {
      decorations.push(Decoration.node(span.from, span.to, { class: className }))
    }
  }

  addOutline(ranges.suggestion, SUGGESTION_CLASS)

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
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const key = suggestionKey

    return [
      new Plugin<SuggestionPluginState>({
        key: suggestionKey,
        state: {
          init() {
            return {
              ranges: { suggestion: null },
              decorations: DecorationSet.empty,
            }
          },
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(key) as Partial<DecorationRanges> | undefined
            if (meta) {
              const ranges: DecorationRanges = {
                suggestion: 'suggestion' in meta ? (meta.suggestion ?? null) : value.ranges.suggestion,
              }
              return { ranges, decorations: buildDecorations(newState, ranges) }
            }
            if (tr.docChanged && value.ranges.suggestion) {
              const ranges: DecorationRanges = { suggestion: mapRange(value.ranges.suggestion, tr) }
              return { ranges, decorations: buildDecorations(newState, ranges) }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty
          },
          handleClick(view, _pos, event) {
            const target = event.target as Element
            const wrapper = target.closest?.(`.${SUGGESTION_CLASS}`) as HTMLElement | null
            if (!wrapper) return false
            const range = key.getState(view.state)?.ranges.suggestion
            if (!range) return false
            editor.emit('suggestion-overlay-click', { range, rect: wrapper.getBoundingClientRect() })
            return true
          },
        },
      }),
    ]
  },
})
