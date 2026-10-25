import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** One passage to highlight: the paragraph text the originality check reported. */
export interface HighlightedPassage {
  text: string
  /** Id the side list uses to find the highlight. */
  id: string
}

export const originalityHighlightKey = new PluginKey<DecorationSet>('originalityHighlight')

/** Collapse whitespace and case so a paragraph matches the text the server compared. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Decorate every text block that holds one of the passages. */
function buildDecorations(doc: ProseMirrorNode, passages: HighlightedPassage[]): DecorationSet {
  if (passages.length === 0) return DecorationSet.empty
  const wanted = passages.map((passage) => ({ id: passage.id, text: normalise(passage.text).slice(0, 160) }))
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const own = normalise(node.textContent)
    if (!own) return false
    const hit = wanted.find((passage) => passage.text && (own.includes(passage.text) || passage.text.includes(own)))
    if (hit) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'originality-passage',
          'data-passage-id': hit.id,
        }),
      )
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Highlights the passages an originality check flagged. The passages are handed
 * in with a transaction meta so the view-only page can update them without
 * recreating the editor.
 */
export const OriginalityHighlightExtension = Extension.create({
  name: 'originalityHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: originalityHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const passages = tr.getMeta(originalityHighlightKey) as HighlightedPassage[] | undefined
            if (passages) return buildDecorations(tr.doc, passages)
            return previous.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations: (state) => originalityHighlightKey.getState(state),
        },
      }),
    ]
  },
})
