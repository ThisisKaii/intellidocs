import { Extension } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** Blocks that are drawn as nothing on the page: deleting one with Backspace changes nothing you can see. */
const INVISIBLE = 'sectionMark'
/** Blocks that only start a page or section; at the top of a document (or tab) they are not drawn either. */
const LEADING = new Set(['sectionMark', 'pageBreak'])

/**
 * Backspace at the start of a block when what is above it cannot be seen.
 *
 * An imported document carries a section marker between blocks wherever Word's section changes
 * (margins, columns), and a tab opens on the page break that starts its first page. The default
 * Backspace deleted those first, so the key seemed to do nothing, and the section's page setup was lost.
 * Instead:
 * - above the block there are only section markers and page breaks (the top of a tab): nothing to
 *   join with, and the markers keep their page setup;
 * - section markers sit between this block and a text block: the two join as if the markers were not
 *   there, and the markers stay after the joined block (the sections keep their setup);
 * - the block opens a column of a column block: the cursor goes to the end of the column before it
 *   (or above the column block), as Word's caret crosses a column break.
 */
export function invisibleBackspace(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const $from = selection.$from
  if ($from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 1) return false
  const depth = $from.depth
  const container = $from.node(depth - 1)
  const index = $from.index(depth - 1)

  let top = index
  while (top > 0 && LEADING.has(container.child(top - 1).type.name)) top -= 1
  if (top === 0 && index > 0 && container.type.name === 'doc') return true

  let first = index
  while (first > 0 && container.child(first - 1).type.name === INVISIBLE) first -= 1
  if (first < index && first > 0) {
    const blockStart = $from.before(depth)
    let marksSize = 0
    for (let at = first; at < index; at += 1) marksSize += container.child(at).nodeSize
    const before = container.child(first - 1)
    const beforeStart = blockStart - marksSize - before.nodeSize
    if (!dispatch) return true
    const tr = state.tr
    if (before.isTextblock && before.type.spec.code !== true) {
      const joinAt = beforeStart + before.nodeSize - 1
      tr.delete(blockStart, $from.after(depth))
      tr.insert(joinAt, $from.parent.content)
      tr.setSelection(TextSelection.create(tr.doc, joinAt))
    } else {
      // A table, picture or column block above: show what Backspace would remove next.
      tr.setSelection(NodeSelection.create(tr.doc, beforeStart))
    }
    dispatch(tr.scrollIntoView())
    return true
  }

  if (container.type.name === 'sectionColumn' && index === 0 && depth >= 3) {
    const target = Selection.findFrom(state.doc.resolve($from.before(depth - 1)), -1, true)
    if (!target) return true
    if (dispatch) dispatch(state.tr.setSelection(target).scrollIntoView())
    return true
  }
  return false
}

export const InvisibleBackspace = Extension.create({
  name: 'invisibleBackspace',
  // Before the first-line indent rule and the default join.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: () => invisibleBackspace(this.editor.state, this.editor.view.dispatch),
    }
  },
})
