import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
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

/** A fresh editor with the real extensions holding the given saved form. */
function openedFrom(html: string, json?: JSONContent | null): { editor: Editor; loaded: 'json' | 'html' } {
  const editor = new Editor({ extensions: editorExtensions })
  const loaded = loadEditorContent(editor, html, json)
  return { editor, loaded }
}

/** Imported-document markup the HTML round trip has had to guard node by node. */
const SAMPLES: Record<string, string> = {
  'table with cell padding':
    '<table><tbody><tr><td style="padding: 5.33333px 8px; vertical-align: top"><p>Cell</p></td><td><p>Two</p></td></tr></tbody></table>',
  'wrapped picture block':
    '<div class="intellidocs-wrap" data-top="83.9"><img src="data:image/png;base64,iVBORw0KGgo=" style="float: left; width: 120px"><p>Text beside the picture.</p></div>',
  'page break starting a section': '<p>Chapter one ends.</p><div class="intellidocs-page-break" data-section="2"></div><h1>Chapter two</h1>',
  'lists with markers': '<ol><li><p>First</p><ul><li><p>Nested</p></li></ul></li><li><p>Second</p></li></ol>',
  equations:
    '<p>Energy <span data-type="inline-math" data-latex="E = mc^2"></span> holds.</p><div data-type="block-math" data-latex="\int_0^1 x\,dx"></div>',
  'styled text': '<p style="text-align: justify; line-height: 1.5"><span style="font-family: Times New Roman; font-size: 12pt; letter-spacing: -0.2px">Body text</span></p>',
}

describe('saving and reopening as editor JSON', () => {
  for (const [name, html] of Object.entries(SAMPLES)) {
    it(`reopens a ${name} exactly as saved`, () => {
      const first = openedFrom(html)
      const saved = first.editor.getJSON()
      first.editor.destroy()

      const second = openedFrom('<p>stale html</p>', saved)
      expect(second.loaded).toBe('json')
      expect(second.editor.getJSON()).toEqual(saved)
      // Saving again changes nothing either.
      const third = openedFrom('', second.editor.getJSON())
      expect(third.editor.getJSON()).toEqual(saved)
      second.editor.destroy()
      third.editor.destroy()
    })
  }

  it('opens the HTML when the saved JSON does not fit the editor schema', () => {
    const { editor, loaded } = openedFrom('<p>From the HTML.</p>', {
      type: 'doc',
      content: [{ type: 'aNodeThatNoLongerExists', content: [{ type: 'text', text: 'From the JSON.' }] }],
    })
    expect(loaded).toBe('html')
    expect(editor.getText()).toBe('From the HTML.')
  })

  it('opens the HTML when the saved JSON breaks a content rule', () => {
    // A table row must hold cells, not text.
    const { editor, loaded } = openedFrom('<p>From the HTML.</p>', {
      type: 'doc',
      content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'text', text: 'loose' }] }] }],
    })
    expect(loaded).toBe('html')
    expect(editor.getText()).toBe('From the HTML.')
  })
})
