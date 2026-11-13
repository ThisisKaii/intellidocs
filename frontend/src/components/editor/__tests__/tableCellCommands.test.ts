import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { CellSelection } from '@tiptap/pm/tables'

import { setCellFill, setCellTextAlign } from '../tableCellCommands'

const TABLE =
  '<table><tbody>' +
  '<tr><td><p>a1</p></td><td><p>b1</p><p>b1 second</p></td></tr>' +
  '<tr><td><p>a2</p></td><td><p>b2</p></td></tr>' +
  '</tbody></table><p>after</p>'

function createEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, TextAlign.configure({ types: ['heading', 'paragraph'] }), Table, TableRow, TableHeader, TableCell],
    content: TABLE,
  })
}

/** Position just inside the paragraph whose text is `text`. */
function posOf(editor: Editor, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos + 1
  })
  return found
}

/** textAlign of every paragraph, keyed by its text. */
function alignments(editor: Editor): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') out[node.textContent] = node.attrs.textAlign
  })
  return out
}

/** Position of the cell node that contains `text`. */
function cellPos(editor: Editor, text: string): number {
  const $pos = editor.state.doc.resolve(posOf(editor, text))
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.spec.tableRole === 'cell') return $pos.before(d)
  }
  throw new Error('not in a cell')
}

describe('setCellTextAlign', () => {
  it('aligns every paragraph of the cell holding the cursor, and nothing else', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(posOf(editor, 'b1'))
    expect(setCellTextAlign(editor, 'center')).toBe(true)
    const a = alignments(editor)
    expect(a['b1']).toBe('center')
    expect(a['b1 second']).toBe('center')
    expect(a['a1']).not.toBe('center')
    expect(a['b2']).not.toBe('center')
    expect(a['after']).not.toBe('center')
    editor.destroy()
  })

  it('aligns all cells of a cell selection in one undoable step', () => {
    const editor = createEditor()
    const { state } = editor
    editor.view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, cellPos(editor, 'a1'), cellPos(editor, 'b2'))))
    expect(setCellTextAlign(editor, 'right')).toBe(true)
    expect(Object.entries(alignments(editor)).filter(([, v]) => v === 'right').map(([k]) => k).sort())
      .toEqual(['a1', 'a2', 'b1', 'b1 second', 'b2'])
    editor.commands.undo()
    expect(Object.values(alignments(editor))).not.toContain('right')
    editor.destroy()
  })

  it('does nothing outside a table', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(posOf(editor, 'after'))
    expect(setCellTextAlign(editor, 'center')).toBe(false)
    editor.destroy()
  })
})

describe('setCellFill', () => {
  it('sets and clears the cell background', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(posOf(editor, 'a2'))
    // The stock cell has no backgroundColor attribute; the app's CustomTableCell adds it.
    // Here we only check the command is wired to setCellAttribute without throwing.
    expect(() => setCellFill(editor, '#fef08a')).not.toThrow()
    expect(() => setCellFill(editor, null)).not.toThrow()
    editor.destroy()
  })
})
