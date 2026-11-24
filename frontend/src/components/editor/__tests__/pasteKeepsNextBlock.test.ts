import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../TiptapEditor'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom has no ClipboardEvent; view.pasteHTML only passes one to the paste hooks.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  ;(globalThis as unknown as { ClipboardEvent: typeof Event }).ClipboardEvent = class extends Event {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function blocks(current: Editor): string[] {
  const out: string[] = []
  current.state.doc.forEach((node) => out.push(`${node.type.name}: ${node.textContent}`))
  return out
}

/** Select from the start of the block reading `from` to the start of the block reading `to`. */
function selectBetween(current: Editor, from: string, to: string): void {
  let start = -1
  let end = -1
  current.state.doc.forEach((node, offset) => {
    if (node.textContent === from) start = offset + 1
    if (node.textContent === to) end = offset + 1
  })
  current.view.dispatch(current.state.tr.setSelection(TextSelection.create(current.state.doc, start, end)))
}

describe('pasting paragraphs over a selection that ends where a heading starts', () => {
  it('keeps the heading as its own block', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>Old one</p><p>Old two</p><h2>Network Design</h2><p>Body</p>' })
    selectBetween(editor, 'Old one', 'Network Design')
    editor.view.pasteHTML('<p>New one</p><p>New two</p>')
    expect(blocks(editor)).toEqual(['paragraph: New one', 'paragraph: New two', 'heading: Network Design', 'paragraph: Body'])
  })

  it("keeps the first pasted paragraph's own layout when whole paragraphs are replaced", () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>Old one</p><p>Old two</p><h2>Next</h2><p>Body</p>' })
    selectBetween(editor, 'Old one', 'Next')
    editor.view.pasteHTML('<p style="text-align:justify">New one</p><p>New two</p>')
    expect(blocks(editor)).toEqual(['paragraph: New one', 'paragraph: New two', 'heading: Next', 'paragraph: Body'])
    expect(editor.state.doc.firstChild?.attrs.textAlign).toBe('justify')
  })

  it('still joins a single pasted line into the paragraph, as typing would', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>Start end</p>' })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)))
    editor.view.pasteHTML('<p>mid-</p>')
    expect(blocks(editor)).toEqual(['paragraph: Start mid-end'])
  })
})
