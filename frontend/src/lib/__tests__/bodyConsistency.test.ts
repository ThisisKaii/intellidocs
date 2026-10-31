import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import { findBodyDeviations } from '../bodyConsistency'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const SENTENCE = 'This sentence is long enough to count as running body text in the thesis document.'

/** A document with a cover line, a chapter heading and `count` justified body paragraphs, with `extra` appended. */
function documentHtml(count: number, extra = ''): string {
  const body = Array.from({ length: count }, (_, i) => `<p style="text-align:justify">${SENTENCE} ${i}</p>`).join('')
  return `<p style="text-align:center">A cover line that is long enough to pass for prose but belongs to the front matter page</p><h1>INTRODUCTION</h1>${body}${extra}`
}

/** Load HTML and run the sweep over it. */
function sweep(html: string): ReturnType<typeof findBodyDeviations> {
  const editor = new Editor({ extensions: editorExtensions, content: html })
  const result = findBodyDeviations(editor.state.doc)
  editor.destroy()
  return result
}

describe('findBodyDeviations', () => {
  it('flags a bold and a left-aligned paragraph among justified body text', () => {
    const odd = `<p style="text-align:justify"><strong>${SENTENCE} bold</strong></p><p>${SENTENCE} left</p>`
    const { deviations } = sweep(documentHtml(12, odd))
    expect(deviations.map((d) => d.differences[0])).toEqual(['bold', expect.stringContaining('aligned')])
  })

  it('leaves a document alone when its body text is uniform', () => {
    expect(sweep(documentHtml(12)).deviations).toEqual([])
  })

  it('ignores the front matter before the first chapter', () => {
    const { deviations } = sweep(documentHtml(12))
    expect(deviations.some((d) => d.text.startsWith('A cover line'))).toBe(false)
  })

  it('gives no verdict when the body is mixed throughout', () => {
    const mixed = Array.from({ length: 10 }, (_, i) => (i % 2 ? `<p style="text-align:justify">${SENTENCE} ${i}</p>` : `<p>${SENTENCE} ${i}</p>`)).join('')
    expect(sweep(`<h1>INTRODUCTION</h1>${mixed}`).deviations).toEqual([])
  })

  it('does not look at list items', () => {
    const list = `<ul><li><p><strong>${SENTENCE} item</strong></p></li></ul>`
    expect(sweep(documentHtml(12, list)).deviations).toEqual([])
  })
})
