import { Extension } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Pasting several paragraphs over a selection that ends at the very start of a paragraph or heading
 * keeps that paragraph as it was, as Word and Google Docs do.
 *
 * ProseMirror leaves a pasted slice open at its end, so its last paragraph and the block after the
 * selection were joined into one: replacing a section that ran up to a "Network Design" heading turned
 * the heading into the tail of the last pasted sentence (and "model.Network" then read as a web
 * address and was linked). Closing the slice's end puts the pasted blocks before that block instead.
 * Likewise, when whole paragraphs are selected from their start, the first pasted paragraph keeps its own
 * alignment, indent and spacing rather than taking the replaced paragraph's.
 */
export const PasteKeepsNextBlock = Extension.create({
  name: 'pasteKeepsNextBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteKeepsNextBlock'),
        props: {
          transformPasted(slice, view) {
            const { selection } = view.state
            const { $from, $to } = selection
            if (selection.empty || slice.content.childCount < 2) return slice
            const endsAtBlockStart = $to.parent.isTextblock && $to.parentOffset === 0
            // Whole paragraphs selected from their start: the pasted paragraphs keep their own layout
            // (alignment, indent, spacing) instead of the first one taking the replaced paragraph's.
            const startsAtBlockStart = $from.parent.isTextblock && $from.parentOffset === 0 && !$from.sameParent($to)
            const openStart = startsAtBlockStart ? 0 : slice.openStart
            const openEnd = endsAtBlockStart ? 0 : slice.openEnd
            if (openStart === slice.openStart && openEnd === slice.openEnd) return slice
            return new Slice(slice.content, openStart, openEnd)
          },
        },
      }),
    ]
  },
})
