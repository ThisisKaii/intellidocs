import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import { feedbackBlock } from '../feedbackBlock'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** The range of the first block whose text begins with `text`. */
function rangeOf(target: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null
  target.state.doc.descendants((node, pos) => {
    if (!range && node.isTextblock && node.textContent.startsWith(text)) range = { from: pos, to: pos + node.nodeSize }
    return !range
  })
  if (!range) throw new Error(`no block starts with ${text}`)
  return range
}

describe('feedbackBlock', () => {
  it('gives the block text and its current format as a model label', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: '<h2>Rationale of the Study</h2><p>Body text.</p><ul><li><p>A point</p></li></ul><ol><li><p>A step</p></li></ol>',
    })
    const doc = editor.state.doc
    expect(feedbackBlock(doc, rangeOf(editor, 'Rationale'))).toEqual({ blockText: 'Rationale of the Study', keptFormat: 'heading2' })
    expect(feedbackBlock(doc, rangeOf(editor, 'Body'))).toEqual({ blockText: 'Body text.', keptFormat: 'paragraph' })
    expect(feedbackBlock(doc, rangeOf(editor, 'A point'))?.keptFormat).toBe('unordered_list')
    expect(feedbackBlock(doc, rangeOf(editor, 'A step'))?.keptFormat).toBe('ordered_list')
  })

  it('leaves out a format the model has no label for, and gives nothing for an empty range', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<h5>Deep heading</h5><p></p>' })
    expect(feedbackBlock(editor.state.doc, rangeOf(editor, 'Deep'))).toEqual({ blockText: 'Deep heading' })
    expect(feedbackBlock(editor.state.doc, null)).toBeNull()
  })
})
