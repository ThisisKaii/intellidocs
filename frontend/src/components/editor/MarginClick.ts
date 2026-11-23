import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** The paginator's page furniture: margins, headers, footers and the gap between pages. */
const PAGE_FURNITURE = '.rm-pages-wrapper, .rm-page-break, .rm-page-header, .rm-page-footer, .rm-pagination-gap'

/**
 * The text position a click at `y` in a page's margin belongs to: the start of the first block that
 * reaches below it (for a footer click, the block running across the page end), else the last block.
 * Top-level blocks are searched by their boxes, so a long document costs a few measurements.
 */
export function positionNearMargin(view: EditorView, y: number): number | null {
  const { doc } = view.state
  const starts: number[] = []
  doc.forEach((_node, offset) => starts.push(offset))
  const bottomOf = (index: number): number => {
    const dom = view.nodeDOM(starts[index])
    return dom instanceof HTMLElement ? dom.getBoundingClientRect().bottom : Number.NEGATIVE_INFINITY
  }
  // First block whose box ends below the click (boxes run down the document in order).
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (bottomOf(middle) <= y) low = middle + 1
    else high = middle
  }
  const below = low < starts.length ? low : starts.length - 1
  if (below < 0) return null
  const textStart = (from: number, to: number): number | null => {
    let found: number | null = null
    doc.nodesBetween(from, to, (node, pos) => {
      if (found !== null) return false
      if (node.isTextblock) {
        found = pos + 1
        return false
      }
      return true
    })
    return found
  }
  const node = doc.child(below)
  const inBlock = textStart(starts[below], starts[below] + node.nodeSize)
  if (inBlock !== null) return inBlock
  // An atom (a page break, a picture): the next text after it.
  return textStart(starts[below], doc.content.size)
}

/**
 * A single click in a page's top or bottom margin (where the header and footer sit) puts the caret
 * on the nearest line of that page. The paginator draws every page's furniture inside one widget at
 * the start of the document, so the browser otherwise put the caret before the document's first
 * block: Backspace or typing after a click near the top of page 12 changed the title page instead.
 * Double-clicks are left alone (they open Page Setup for the header or footer).
 */
export const MarginClick = Extension.create({
  name: 'marginClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('marginClick'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0 || event.detail > 1 || event.shiftKey) return false
              const target = event.target
              if (!(target instanceof Element) || !target.closest(PAGE_FURNITURE)) return false
              const pos = positionNearMargin(view, event.clientY)
              if (pos === null) return false
              event.preventDefault()
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView())
              view.focus()
              return true
            },
          },
        },
      }),
    ]
  },
})
