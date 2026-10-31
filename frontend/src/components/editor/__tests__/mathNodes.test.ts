import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '../TiptapEditor'
import { nextEquationNumber } from '../MathNodes'

beforeAll(() => {
  // The page layout code watches element sizes; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

/** Types text one character at a time through ProseMirror's text-input handler, as a keyboard does. */
function type(editor: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)),
    )
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to))
  }
}

/** Every math node in the document as [type, latex, number]. */
function mathNodes(editor: Editor): Array<[string, string, string | null]> {
  const found: Array<[string, string, string | null]> = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'inlineMath' || node.type.name === 'blockMath') {
      found.push([node.type.name, String(node.attrs.latex), (node.attrs.number as string | null) ?? null])
    }
    return true
  })
  return found
}

function empty(): Editor {
  return new Editor({ extensions: editorExtensions, content: '<p></p>' })
}

describe('imported equations', () => {
  it('keep their LaTeX and number through a load and save', () => {
    const html =
      '<p>Where <span data-type="inline-math" data-latex="s=\\frac{n}{N}"></span> is the score.</p>' +
      '<div data-type="block-math" data-latex="E=mc^{2}" data-number="1"></div>'
    const editor = new Editor({ extensions: editorExtensions, content: html })
    expect(mathNodes(editor)).toEqual([
      ['inlineMath', 's=\\frac{n}{N}', null],
      ['blockMath', 'E=mc^{2}', '1'],
    ])
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).toContain('data-type="inline-math"')
    expect(saved).toContain('data-type="block-math"')
    expect(saved).toContain('data-number="1"')
  })

  it('draw with KaTeX, a display equation in display mode', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<div data-type="block-math" data-latex="\\sum_{i=1}^{n} x_i"></div>' })
    const dom = editor.view.dom as HTMLElement
    expect(dom.querySelector('.katex-display')).not.toBeNull()
    expect(dom.querySelector('[data-type="block-math"]')?.getAttribute('data-latex')).toBe('\\sum_{i=1}^{n} x_i')
    editor.destroy()
  })

  it('show a LaTeX mistake as red source text instead of dropping it', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<div data-type="block-math" data-latex="\\frac{1}"></div>' })
    const dom = editor.view.dom as HTMLElement
    expect(dom.querySelector('.block-math-error')).not.toBeNull()
    expect(mathNodes(editor)).toEqual([['blockMath', '\\frac{1}', null]])
    editor.destroy()
  })

  it('still read the equation markup earlier versions saved', () => {
    const editor = new Editor({
      extensions: editorExtensions,
      content: '<div data-academic-equation data-latex="a^2+b^2=c^2" data-mode="display" data-number="3"></div>',
    })
    expect(mathNodes(editor)).toEqual([['blockMath', 'a^2+b^2=c^2', '3']])
    editor.destroy()
  })
})

describe('typing equations', () => {
  it('turns $x^2$ into an equation in the line', () => {
    const editor = empty()
    type(editor, 'Area is $x^2$')
    expect(mathNodes(editor)).toEqual([['inlineMath', 'x^2', null]])
    editor.destroy()
  })

  it('leaves prices alone', () => {
    const editor = empty()
    type(editor, 'It costs $5 and then $10')
    expect(mathNodes(editor)).toEqual([])
    expect(editor.state.doc.textContent).toBe('It costs $5 and then $10')
    editor.destroy()
  })

  it('does not treat the start of $$ as an inline equation', () => {
    const editor = empty()
    type(editor, '$$x$')
    expect(mathNodes(editor)).toEqual([])
    editor.destroy()
  })

  it('turns a whole paragraph typed as $$E=mc^2$$ into a display equation', () => {
    const editor = empty()
    type(editor, '$$E=mc^2$$')
    expect(mathNodes(editor)).toEqual([['blockMath', 'E=mc^2', null]])
    expect(editor.state.doc.textContent).toBe('')
    editor.destroy()
  })
})

describe('equation numbers', () => {
  it('continue after the highest plain number', () => {
    const editor = new Editor({
      extensions: editorExtensions,
      content:
        '<div data-type="block-math" data-latex="a" data-number="1"></div>' +
        '<div data-type="block-math" data-latex="b" data-number="4"></div>' +
        '<div data-type="block-math" data-latex="c" data-number="2a"></div>',
    })
    expect(nextEquationNumber(editor)).toBe('5')
    editor.destroy()
  })

  it('start at 1 in a document without numbered equations', () => {
    const editor = empty()
    expect(nextEquationNumber(editor)).toBe('1')
    editor.destroy()
  })
})
