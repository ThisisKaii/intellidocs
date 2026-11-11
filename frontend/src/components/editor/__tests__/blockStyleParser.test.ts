import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { editorExtensions } from '../TiptapEditor'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { blockAwareDomParser } from '../BlockStyleParser'

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function parse(html: string): ProseMirrorNode {
  editor = new Editor({ extensions: editorExtensions, content: '' })
  const dom = document.createElement('div')
  dom.innerHTML = html
  return blockAwareDomParser(editor.schema).parse(dom)
}

const marksOf = (doc: ProseMirrorNode): string[] => doc.firstChild?.firstChild?.marks.map((m) => m.type.name) ?? []

describe('blockAwareDomParser', () => {
  it("does not turn a heading's own font-weight / font-style into marks", () => {
    const doc = parse('<h1 style="font-size:18pt; font-weight:700; font-style:italic">Chapter</h1>')
    expect(doc.firstChild?.type.name).toBe('heading')
    expect(marksOf(doc)).toEqual([])
  })

  it("does not turn a paragraph's own font-size into a text-style mark", () => {
    const doc = parse('<p style="font-size:11pt">Caption</p>')
    expect(marksOf(doc)).not.toContain('textStyle')
  })

  it('still reads inline styles on spans inside a block as marks', () => {
    const doc = parse('<p><span style="font-weight:700">Bold</span> and <span style="font-style:italic">slanted</span></p>')
    expect(marksOf(doc)).toContain('bold')
    expect(doc.firstChild?.lastChild?.marks.map((m) => m.type.name)).toContain('italic')
  })

  it('keeps tag-based marks everywhere', () => {
    expect(marksOf(parse('<h2><strong>Section</strong></h2>'))).toContain('bold')
  })

  it('is what the live editor view uses to re-read the DOM', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>x</p>' })
    expect(editor.view.someProp('domParser')).toBeDefined()
  })
})
