import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { editorExtensions } from '../TiptapEditor'
import {
  applyFormatsToRanges,
  applyFormatsToSelection,
  findCategoryRanges,
  resolveTargetRanges,
} from '../chatFormatting'

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

/** Put the cursor inside the first block containing some text. */
function cursorIn(ed: Editor, text: string): void {
  let at = -1
  ed.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isTextblock && node.textContent.includes(text)) at = pos + 1
    return at === -1
  })
  ed.commands.setTextSelection(at)
}

describe('chat formatting keeps existing formatting', () => {
  it('asking for bold on text that is already bold keeps it bold', () => {
    const ed = open('<p><strong>Already bold</strong></p>')
    cursorIn(ed, 'Already bold')
    applyFormatsToSelection(ed, ['bold'])
    expect(ed.getHTML()).toContain('<strong>Already bold</strong>')
  })

  it('asking for a heading on a heading of that level keeps it a heading', () => {
    const ed = open('<h2>Background of the Study</h2>')
    cursorIn(ed, 'Background')
    applyFormatsToSelection(ed, ['heading2'])
    expect(ed.getHTML()).toMatch(/<h2[^>]*>Background of the Study<\/h2>/)
  })

  it('turning a centered paragraph into a heading keeps it centered and keeps its marks', () => {
    const ed = open('<p style="text-align: center"><em>Statement of the Problem</em></p>')
    cursorIn(ed, 'Statement')
    applyFormatsToSelection(ed, ['heading2'])
    const html = ed.getHTML()
    expect(html).toMatch(/<h2[^>]*text-align: center[^>]*><em>Statement of the Problem<\/em><\/h2>/)
  })

  it('a heading request on a section makes only its title a heading, not the paragraphs under it', () => {
    const ed = open(
      '<p>CHAPTER 1</p><p style="text-align: justify"><em>First body paragraph.</em></p><p>Second body paragraph.</p><p>CHAPTER 2</p><p>Later.</p>'
    )
    const ranges = resolveTargetRanges(ed.state.doc, 'chapter 1', 'section')
    applyFormatsToRanges(ed, ranges, ['heading1', 'bold'], undefined, false)
    const html = ed.getHTML()
    expect(html).toMatch(/<h1[^>]*><strong>CHAPTER 1<\/strong><\/h1>/)
    // The body stays body text, with its own alignment and italics, now also bold.
    expect(html).toMatch(/<p[^>]*text-align: justify[^>]*><em><strong>First body paragraph\.<\/strong><\/em><\/p>|<p[^>]*text-align: justify[^>]*><strong><em>First body paragraph\.<\/em><\/strong><\/p>/)
    expect(html).toContain('<p>CHAPTER 2</p>')
  })

  it('a new font size keeps each run’s own font family', () => {
    const ed = open('<p><span style="font-family: Arial">Arial run</span> and <span style="font-family: Georgia">Georgia run</span></p>')
    const ranges = [{ from: 1, to: ed.state.doc.firstChild ? ed.state.doc.firstChild.nodeSize - 1 : 1 }]
    applyFormatsToRanges(ed, ranges, [], 14, false)
    const html = ed.getHTML()
    expect(html).toMatch(/font-family: Arial[^"]*font-size: 14pt|font-size: 14pt[^"]*font-family: Arial/)
    expect(html).toMatch(/font-family: Georgia[^"]*font-size: 14pt|font-size: 14pt[^"]*font-family: Georgia/)
  })

  it('asking for a numbered list twice does not take the list away', () => {
    const ed = open('<p>Research question one</p>')
    cursorIn(ed, 'Research')
    applyFormatsToSelection(ed, ['ordered_list'])
    cursorIn(ed, 'Research')
    applyFormatsToSelection(ed, ['ordered_list'])
    expect(ed.getHTML()).toContain('<ol')
  })
})

describe('findCategoryRanges', () => {
  it('section headings are the headings other than chapter headings', () => {
    const ed = open('<h1>CHAPTER 1</h1><h2>Background of the Study</h2><p>Body</p><h2>Scope</h2>')
    const texts = findCategoryRanges(ed.state.doc, 'sections').map((range) => ed.state.doc.textBetween(range.from, range.to))
    expect(texts).toEqual(['Background of the Study', 'Scope'])
  })

  it('body paragraphs leave out a "CHAPTER n" line styled as a paragraph', () => {
    const ed = open('<p>CHAPTER 1</p><p>Body one.</p><p>Body two.</p>')
    const texts = findCategoryRanges(ed.state.doc, 'paragraphs').map((range) => ed.state.doc.textBetween(range.from, range.to))
    expect(texts).toEqual(['Body one.', 'Body two.'])
  })
})
