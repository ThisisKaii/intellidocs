import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../TiptapEditor'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

const IMPORTED =
  '<div class="intellidocs-columns" data-widths="50,50" data-gap="9.5">' +
  '<div class="intellidocs-column"><p>Artificial Intelligence (AI)</p></div>' +
  '<div class="intellidocs-column"><p>Refers to the technology</p></div></div>'

describe('columnSection', () => {
  it('lays its columns out at their widths with the gap between them', () => {
    editor = new Editor({ extensions: editorExtensions, content: IMPORTED })
    const block = editor.view.dom.querySelector('.intellidocs-columns') as HTMLElement
    expect(block.style.gridTemplateColumns).toBe('50fr 50fr')
    expect(block.style.columnGap).toBe('9.5px')
  })

  it('keeps its widths and gap when saved as HTML and opened again', () => {
    // A tab is saved as HTML: without its widths the columns came back stacked on reopening.
    editor = new Editor({ extensions: editorExtensions, content: IMPORTED })
    const saved = editor.getHTML()
    editor.destroy()
    editor = new Editor({ extensions: editorExtensions, content: saved })
    const node = editor.state.doc.firstChild
    expect(node?.type.name).toBe('columnSection')
    expect(node?.attrs.widths).toBe('50,50')
    expect(node?.attrs.gap).toBe(9.5)
  })
})
