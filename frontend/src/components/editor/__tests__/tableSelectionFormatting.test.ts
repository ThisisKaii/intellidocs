import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Editor as ReactEditor } from '@tiptap/react'
import { CellSelection } from '@tiptap/pm/tables'

import { editorExtensions } from '../TiptapEditor'
import { applyStyleCommand } from '../styleCommands'
import { toggleListInSelectedCells } from '../tableCellCommands'

// Pagination and page-break plugins observe layout; jsdom has no ResizeObserver.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const TABLE =
  '<p>before</p><table><tbody>' +
  '<tr><td><p>a1</p></td><td><p>b1</p></td><td><p>c1</p></td></tr>' +
  '<tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr>' +
  '</tbody></table><p>after</p>'

let editor: Editor

/** An editor with the table, settled the way it is before anyone selects cells: table-plus
 *  regroups a freshly loaded table's rows on the first transaction, replacing the table node. */
function createEditor(): Editor {
  const ed = new Editor({ extensions: editorExtensions, content: TABLE })
  ed.view.dispatch(ed.state.tr)
  return ed
}

afterEach(() => editor?.destroy())

/** Position of the cell whose text is `text`. */
function cellPos(text: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.spec.tableRole === 'cell' && node.textContent === text) found = pos
    return found < 0
  })
  if (found < 0) throw new Error(`no cell ${text}`)
  return found
}

/** Select the rectangle of cells from `anchor` to `head`, as dragging across them does. */
function selectCells(anchor: string, head: string): void {
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos(anchor), cellPos(head))))
}

/** The node holding a cell's text, and the marks on that text. */
function block(text: string): { type: string; attrs: Record<string, unknown>; marks: string[]; inList: boolean } {
  let out: { type: string; attrs: Record<string, unknown>; marks: string[]; inList: boolean } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (out || !node.isTextblock || node.textContent !== text) return !out
    const $pos = editor.state.doc.resolve(pos + 1)
    let inList = false
    for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name.endsWith('List')) inList = true
    const marks = node.firstChild?.marks.map((m) => m.type.name) ?? []
    out = { type: node.type.name, attrs: node.attrs, marks, inList }
    return false
  })
  if (!out) throw new Error(`no block ${text}`)
  return out
}

const SELECTED = ['a1', 'b1', 'a2', 'b2']
const UNSELECTED = ['c1', 'c2', 'before', 'after']

describe('formatting several selected table cells', () => {
  it('applies a heading style from the style gallery to every selected cell', () => {
    editor = createEditor()
    selectCells('a1', 'b2')
    applyStyleCommand(editor as unknown as ReactEditor, 'h2')
    for (const text of SELECTED) expect(block(text).type, text).toBe('heading')
    for (const text of UNSELECTED) expect(block(text).type, text).toBe('paragraph')
    // The cells stay selected so the next format reaches all of them too.
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
  })

  it('indents every selected cell', () => {
    editor = createEditor()
    selectCells('a1', 'b2')
    editor.commands.indent()
    for (const text of SELECTED) expect(block(text).attrs.indent, text).toBe(1)
    for (const text of UNSELECTED) expect(block(text).attrs.indent || 0, text).toBe(0)
  })

  it('sets paragraph spacing on every selected cell', () => {
    editor = createEditor()
    selectCells('a1', 'b2')
    editor.commands.setParagraphSpacing(6, 12)
    for (const text of SELECTED) expect(String(block(text).attrs.style ?? ''), text).toMatch(/margin-top:\s*6pt/)
    expect(String(block('c1').attrs.style ?? '')).not.toMatch(/margin-top/)
  })

  it('makes a bullet list in every selected cell', () => {
    editor = createEditor()
    selectCells('a1', 'b2')
    expect(toggleListInSelectedCells(editor, 'bulletList')).toBe(true)
    for (const text of SELECTED) expect(block(text).inList, text).toBe(true)
    for (const text of UNSELECTED) expect(block(text).inList, text).toBe(false)
  })

  it('bolds every selected cell', () => {
    editor = createEditor()
    selectCells('a1', 'b2')
    editor.chain().focus().toggleBold().run()
    for (const text of SELECTED) expect(block(text).marks, text).toContain('bold')
    expect(block('c1').marks).not.toContain('bold')
  })
})
