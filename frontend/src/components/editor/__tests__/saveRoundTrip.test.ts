import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../TiptapEditor'
import { loadEditorContent } from '@/lib/loadEditorContent'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The document as it comes back after being saved and opened again. */
function reopened(html: string): string {
  const first = new Editor({ extensions: editorExtensions })
  loadEditorContent(first, html)
  const saved = first.getHTML()
  first.destroy()
  const second = new Editor({ extensions: editorExtensions })
  loadEditorContent(second, saved)
  return second.getHTML()
}

describe('saving and reopening a document', () => {
  it('keeps a table cell padding written as the shorthand the browser saves', () => {
    const html = reopened('<table><tbody><tr><td style="padding: 5.33333px 8px; vertical-align: top"><p>Cell</p></td></tr></tbody></table>')
    expect(html).toContain('padding: 5.33333px 8px')
  })

  it('keeps a wrapped picture block and where the picture starts', () => {
    const html = reopened('<div class="intellidocs-wrap" data-top="83.9"><p>Text beside the picture.</p></div>')
    expect(html).toContain('class="intellidocs-wrap"')
    expect(html).toContain('data-top="83.9"')
    expect(html).toMatch(/width:\s*100%/)
  })
})
