import { Editor } from '@tiptap/core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import { findExtraBlankLines } from '../blankLines'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

let editor: Editor
afterEach(() => editor?.destroy())

const body = (n: number): string => `<p>Body paragraph number ${n} with enough words in it to read as ordinary prose in the body text of a chapter.</p>`
const blank = '<p></p>'

function runs(html: string, crossesPage?: Parameters<typeof findExtraBlankLines>[1]) {
  editor = new Editor({ extensions: editorExtensions, content: html })
  return findExtraBlankLines(editor.state.doc, crossesPage).map((run) => ({
    extra: run.extra,
    usual: run.usual,
    next: run.nextText.slice(0, 25),
    removes: editor.state.doc.textBetween(run.from, run.to, '|', '¶'),
  }))
}

describe('findExtraBlankLines', () => {
  it('flags blank lines between body paragraphs when the body otherwise has none', () => {
    const html = [body(1), body(2), body(3), blank, blank, body(4), body(5), body(6), body(7)].join('')
    expect(runs(html)).toEqual([{ extra: 2, usual: 0, next: 'Body paragraph number 4 w', removes: '|' }])
  })

  it('judges by the document\'s own habit: one blank line between paragraphs is fine, two is one too many', () => {
    const html = [body(1), blank, body(2), blank, body(3), blank, blank, body(4), blank, body(5), blank, body(6), blank, body(7)].join('')
    expect(runs(html).map((r) => [r.extra, r.usual])).toEqual([[1, 1]])
  })

  it('leaves blank lines before a chapter heading, a front-matter label or a page break alone', () => {
    const html = [
      body(1), body(2), body(3), body(4), body(5), body(6),
      blank, blank, blank, blank, '<h1>CHAPTER II</h1>',
      body(7), blank, blank, '<p>DEDICATION</p>',
      body(8), blank, blank, blank, '<hr>',
      body(9),
    ].join('')
    expect(runs(html)).toEqual([])
  })

  it('leaves blank lines that push the next block onto a new page', () => {
    const html = [body(1), body(2), body(3), body(4), blank, blank, blank, body(5), body(6), body(7)].join('')
    expect(runs(html, ({ blankLines }) => blankLines === 3)).toEqual([])
    expect(runs(html)).toHaveLength(1)
  })

  it('needs enough gaps of a kind to know the usual', () => {
    expect(runs([body(1), blank, blank, body(2), body(3)].join(''))).toEqual([])
  })
})
