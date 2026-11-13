import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'

export type CellTextAlign = 'left' | 'center' | 'right'

/** Cell fills offered in the table menus: none plus light shades that keep black text readable. */
export const CELL_FILL_COLORS = ['#f3f4f6', '#e5e7eb', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe'] as const

/** Document ranges of the cells a command applies to: every cell of a cell selection, or the cell holding the cursor. */
export function selectedCellRanges(state: EditorState): Array<{ from: number; to: number }> {
  const { selection } = state
  if (selection instanceof CellSelection) {
    const ranges: Array<{ from: number; to: number }> = []
    selection.forEachCell((node, pos) => ranges.push({ from: pos, to: pos + node.nodeSize }))
    return ranges
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const role = $from.node(depth).type.spec.tableRole
    if (role === 'cell' || role === 'header_cell') {
      const pos = $from.before(depth)
      return [{ from: pos, to: pos + $from.node(depth).nodeSize }]
    }
  }
  return []
}

/**
 * Align the text of the selected cells. Alignment is set on the paragraphs and headings inside
 * each cell (the attribute TextAlign already owns), not on the cell, so saved HTML and imported
 * documents keep the same shape. One transaction, so a single undo reverts it.
 */
export function setCellTextAlign(editor: Editor, align: CellTextAlign): boolean {
  const { state } = editor
  const ranges = selectedCellRanges(state)
  if (ranges.length === 0) return false
  const tr = state.tr
  for (const { from, to } of ranges) {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if ((node.type.name === 'paragraph' || node.type.name === 'heading') && 'textAlign' in node.attrs) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align })
        return false
      }
      return true
    })
  }
  if (!tr.docChanged) return false
  editor.view.dispatch(tr)
  editor.commands.focus()
  return true
}

/** Fill the selected cells with a color, or clear the fill with null. */
export function setCellFill(editor: Editor, color: string | null): boolean {
  return editor.chain().focus().setCellAttribute('backgroundColor', color).run()
}
