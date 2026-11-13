import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Editor as ReactEditor } from '@tiptap/react'

import { editorExtensions } from '../TiptapEditor'
import { applyStyleCommand } from '../styleCommands'
import { textRangeInside } from '../selectionRanges'

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor
afterEach(() => editor?.destroy())

/** The outer edges of the top-level block whose text starts with `text`, as a suggestion gives them. */
function blockEdges(text: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  editor.state.doc.forEach((node, offset) => {
    if (!found && node.textContent.startsWith(text)) found = { from: offset, to: offset + node.nodeSize }
  })
  if (!found) throw new Error(`no block ${text}`)
  return found
}

function blockAt(text: string): { type: string; align: unknown; role: unknown } {
  let out: { type: string; align: unknown; role: unknown } | null = null
  editor.state.doc.forEach((node) => {
    if (!out && node.textContent.startsWith(text)) out = { type: node.type.name, align: node.attrs.textAlign, role: node.attrs.docRole }
  })
  if (!out) throw new Error(`no block ${text}`)
  return out
}

describe('applying a suggestion to a block given by its edges', () => {
  it('"Format as Title" makes the block the centered document title', () => {
    // It used to clear the alignment and then fail to convert, leaving a left-aligned paragraph.
    editor = new Editor({
      extensions: editorExtensions,
      content: '<p>Republic of the Philippines</p><p style="text-align:center"><strong>AN INTELLIGENT EDITOR</strong></p><p>body</p>',
    })
    const { from, to } = blockEdges('AN INTELLIGENT EDITOR')
    applyStyleCommand(editor as unknown as ReactEditor, 'title', from, to, 'uclm_capstone')
    expect(blockAt('AN INTELLIGENT EDITOR')).toEqual({ type: 'heading', align: 'center', role: 'title' })
    expect(blockAt('Republic').type).toBe('paragraph')
    expect(blockAt('body').type).toBe('paragraph')
  })

  it('moves block edges inside the text they cover', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>first</p><p>second</p>' })
    const edges = blockEdges('second')
    const inside = textRangeInside(editor.state.doc, edges.from, edges.to)
    expect(editor.state.doc.textBetween(inside.from, inside.to)).toBe('second')
    expect(editor.state.doc.resolve(inside.from).parent.isTextblock).toBe(true)
    // Positions already inside text are kept.
    expect(textRangeInside(editor.state.doc, inside.from + 1, inside.to - 1)).toEqual({ from: inside.from + 1, to: inside.to - 1 })
  })
})
