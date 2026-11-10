import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { undo, undoDepth } from '@tiptap/pm/history'
import { editorExtensions } from '../TiptapEditor'
import { addLearnedFormatSteps } from '@/lib/learnedFormat'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function open(html: string): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  return editor
}

/** Whole-block ranges of every top-level paragraph whose text includes `text`. */
function blocksWith(ed: Editor, text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  ed.state.doc.forEach((node, offset) => {
    if (node.textContent.includes(text)) ranges.push({ from: offset, to: offset + node.nodeSize })
  })
  return ranges
}

const DEDICATION =
  '<p><strong>DEDICATION</strong></p>' +
  '<p><strong><em>To my parents, for everything.</em></strong></p>' +
  '<p><strong><em>To my teachers, for their patience.</em></strong></p>' +
  '<p><strong><em>To my friends, for the late nights.</em></strong></p>' +
  '<p><strong><em>To God, for the strength.</em></strong></p>'

describe('addLearnedFormatSteps', () => {
  it('fixes every paragraph of a merged card in one undo step', () => {
    const ed = open(DEDICATION)
    const before = ed.getHTML()
    const ranges = blocksWith(ed, 'To ')
    expect(ranges).toHaveLength(4)
    const depth = undoDepth(ed.state)

    const tr = ed.state.tr
    for (const range of ranges) addLearnedFormatSteps(tr, { format: 'paragraph', bold: false, italic: false }, range)
    ed.view.dispatch(tr)

    const html = ed.getHTML()
    expect(html).not.toMatch(/<em>/)
    expect(html).toContain('<p>To my parents, for everything.</p>')
    expect(html).toContain('<p>To God, for the strength.</p>')
    // The DEDICATION heading line was not in the card and stays bold.
    expect(html).toContain('<p><strong>DEDICATION</strong></p>')

    expect(undoDepth(ed.state)).toBe(depth + 1)
    undo(ed.state, ed.view.dispatch)
    expect(ed.getHTML()).toBe(before)
  })

  it('sets heading level, alignment and block style together', () => {
    const ed = open('<p>Chapter one title</p><p>Chapter two title</p>')
    const ranges = blocksWith(ed, 'Chapter')
    const tr = ed.state.tr
    for (const range of ranges) {
      addLearnedFormatSteps(tr, { format: 'heading1', bold: true, textAlign: 'center', blockStyle: { 'margin-top': '24pt' } }, range)
    }
    ed.view.dispatch(tr)
    const html = ed.getHTML()
    expect(html.match(/<h1[^>]*text-align: center[^>]*><strong>Chapter (one|two) title<\/strong><\/h1>/g)).toHaveLength(2)
    expect(html).toContain('margin-top: 24pt')
    expect(undoDepth(ed.state)).toBe(1)
  })

  it('drops an explicit size so the inherited size shows', () => {
    const ed = open('<p><span style="font-size: 16pt">Too big body text</span></p>')
    const [range] = blocksWith(ed, 'Too big')
    const tr = ed.state.tr
    addLearnedFormatSteps(tr, { format: 'paragraph', fontSize: null }, range)
    ed.view.dispatch(tr)
    expect(ed.getHTML()).not.toContain('16pt')
  })

  it('leaves quote blocks to the caller', () => {
    const ed = open('<p>Quoted text</p>')
    const [range] = blocksWith(ed, 'Quoted')
    expect(addLearnedFormatSteps(ed.state.tr, { format: 'blockquote' }, range)).toBe(false)
  })
})
