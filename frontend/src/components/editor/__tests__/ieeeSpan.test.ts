import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '../TiptapEditor'
import { groupBySpan, spanFlags } from '../ieeeSpan'

beforeAll(() => {
  // The page layout code watches element sizes; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

/** Top-level elements of an HTML string. */
function blocks(html: string): Element[] {
  const root = document.createElement('div')
  root.innerHTML = html
  return Array.from(root.children)
}

describe('which blocks run across both columns', () => {
  it('takes the table caption above a marked table and the figure caption below a marked figure', () => {
    const flags = spanFlags([
      { span: false, caption: null },
      { span: false, caption: 'table' },
      { span: true, caption: null },
      { span: true, caption: null },
      { span: false, caption: 'figure' },
      { span: false, caption: null },
    ])
    expect(flags).toEqual([false, true, true, true, true, false])
  })

  it('leaves the other side of a caption alone', () => {
    // A figure caption above, or a table caption below, belongs to somebody else.
    expect(spanFlags([{ span: false, caption: 'figure' }, { span: true, caption: null }, { span: false, caption: 'table' }])).toEqual([false, true, false])
  })

  it('groups a paper body into two-column and full-width runs', () => {
    const groups = groupBySpan(
      blocks(
        '<p>Text one.</p><p>Text two.</p><p>TABLE I. Results</p><table data-span="full"><tr><td>x</td></tr></table><p>Text three.</p>',
      ),
    )
    expect(groups.map((g) => [g.full, g.elements.length])).toEqual([[false, 2], [true, 2], [false, 1]])
  })

  it('reads a caption by its label when it has no stored kind', () => {
    const groups = groupBySpan(blocks('<img data-span="full" src="x.png"><p>Fig. 2. A wide figure</p><p>Body.</p>'))
    expect(groups.map((g) => [g.full, g.elements.length])).toEqual([[true, 2], [false, 1]])
  })

  it('sees a mark on a wrapper around the image', () => {
    const groups = groupBySpan(blocks('<div><img data-span="full" src="x.png"></div><p>Body.</p>'))
    expect(groups.map((g) => g.full)).toEqual([true, false])
  })
})

describe('the editor attribute', () => {
  const html =
    '<p>Intro.</p><p data-caption-kind="table">TABLE I. Wide</p><table><tr><td><p>a</p></td></tr></table>' +
    '<div data-type="block-math" data-latex="E=mc^{2}"></div>'

  it('toggles on a table, keeps through a save, and marks its caption in the draft view', () => {
    const editor = new Editor({ extensions: editorExtensions, content: html })
    // put the caret in the table cell
    let cell = 0
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && !cell) cell = pos + 2
      return true
    })
    editor.commands.setTextSelection(cell)
    expect(editor.commands.toggleFullSpan()).toBe(true)
    const saved = editor.getHTML()
    expect(saved).toMatch(/<table[^>]*data-span="full"/)
    expect((editor.view.dom as HTMLElement).querySelectorAll('.ieee-span').length).toBe(2) // caption and table
    editor.destroy()
  })

  it('toggles back off', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<div data-type="block-math" data-latex="x" data-span="full"></div>' })
    editor.commands.setNodeSelection(0)
    expect(editor.commands.toggleFullSpan()).toBe(true)
    expect(editor.getHTML()).not.toContain('data-span')
    editor.destroy()
  })

  it('does nothing when no table, figure or equation is selected', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<p>Just text.</p>' })
    editor.commands.setTextSelection(2)
    expect(editor.commands.toggleFullSpan()).toBe(false)
    editor.destroy()
  })
})
