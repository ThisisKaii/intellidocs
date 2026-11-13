import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { editorExtensions } from '../TiptapEditor'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { undo, undoDepth } from '@tiptap/pm/history'
import { resolve } from 'node:path'
import {
  applyFormatsToRanges,
  applyFormatsToSelection,
  applyStyle,
  applyPresetToBody,
  findCategoryRanges,
  preferWholeBlocks,
  resolveTargetRanges,
  findLiteralRanges,
  type StyleChange,
} from '../chatFormatting'

/** The chat benchmark's thesis-style document (tests/fixtures/chat_benchmark). */
const BENCHMARK_THESIS = readFileSync(resolve(__dirname, '../../../../../tests/fixtures/chat_benchmark/thesis.html'), 'utf-8')
const NO_STYLE: StyleChange = { lineSpacing: null, firstLineIndentIn: null, fontFamily: null, textCase: null }

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

/** Text of each range, for readable assertions. */
function textsOf(ed: Editor, ranges: Array<{ from: number; to: number }>): string[] {
  return ranges.map((range) => ed.state.doc.textBetween(range.from, range.to, ' | '))
}

describe('12-prompt accuracy benchmark (editor side)', () => {
  it('#1 a section named without quotes resolves to its title line only', () => {
    const ed = open(BENCHMARK_THESIS)
    expect(textsOf(ed, resolveTargetRanges(ed.state.doc, 'statement of the problem', 'heading'))).toEqual(['Statement of the Problem'])
    // The whole section still includes the text under it.
    expect(textsOf(ed, resolveTargetRanges(ed.state.doc, 'statement of the problem', 'section'))[0]).toContain('How accurate')
  })

  it('#2 "chapter 1" as a heading target is the CHAPTER 1 line, not the chapter', () => {
    const ed = open('<p>CHAPTER 1</p><p>Body that must stay as it is.</p><p>CHAPTER 2</p>')
    const ranges = resolveTargetRanges(ed.state.doc, 'chapter 1', 'heading')
    applyFormatsToRanges(ed, ranges, ['bold', 'align_center'], undefined, false)
    expect(ed.getHTML()).toMatch(/<p[^>]*text-align: center[^>]*><strong>CHAPTER 1<\/strong><\/p><p>Body that must stay as it is\.<\/p>/)
  })

  it('#3 a heading on quoted words picks the line that is those words, not a sentence mentioning them', () => {
    const ed = open('<p>The background of the study shows a gap.</p><p><strong>Background of the Study</strong></p>')
    const ranges = preferWholeBlocks(ed.state.doc, findLiteralRanges(ed.state.doc, 'background of the study'))
    applyFormatsToRanges(ed, ranges, ['heading2'], undefined, false)
    const html = ed.getHTML()
    expect(html).toContain('<p>The background of the study shows a gap.</p>')
    expect(html).toMatch(/<h2[^>]*><strong>Background of the Study<\/strong><\/h2>/)
  })

  it('#4 the research questions become ONE numbered list without their typed numbers', () => {
    const ed = open(BENCHMARK_THESIS)
    const ranges = findCategoryRanges(ed.state.doc, 'questions')
    expect(ranges).toHaveLength(1)
    applyFormatsToRanges(ed, ranges, ['ordered_list'], undefined, false)
    const html = ed.getHTML()
    expect(html.match(/<ol/g)).toHaveLength(1)
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).not.toMatch(/>\s*1\. How long/)
    expect(html).toContain('This study aims to answer the following questions:</p>')
  })

  it('#5 section headings include bold-paragraph headings but not chapter lines, chapter titles or body', () => {
    const ed = open(BENCHMARK_THESIS)
    expect(textsOf(ed, findCategoryRanges(ed.state.doc, 'sections'))).toEqual([
      'Background of the Study',
      'Statement of the Problem',
      'Significance of the Study',
      'Scope and Delimitation',
      'Conceptual Framework',
    ])
  })

  it('#6 indent goes on body paragraphs only and keeps their alignment', () => {
    const ed = open(BENCHMARK_THESIS)
    applyFormatsToRanges(ed, findCategoryRanges(ed.state.doc, 'paragraphs'), [], undefined, false, { ...NO_STYLE, firstLineIndentIn: 0.5 })
    const html = ed.getHTML()
    expect(html).toMatch(/<p style="text-align: justify;? ?text-indent: 0\.5in;?">Students spend/)
    expect(html).not.toMatch(/<(h[1-3])[^>]*text-indent/)
    expect(html).not.toMatch(/text-indent[^>]*><strong>Statement of the Problem/)
  })

  it('#7 double spacing sets line-height 2 on every block and keeps other block styles', () => {
    const ed = open(BENCHMARK_THESIS)
    applyStyle(ed, { from: 0, to: ed.state.doc.content.size }, { ...NO_STYLE, lineSpacing: 2 })
    const html = ed.getHTML()
    expect(html).toMatch(/<p style="text-align: justify;? ?line-height: 2;?">Students spend/)
    expect(html).toMatch(/<h2[^>]*line-height: 2[^>]*>Scope and Delimitation/)
  })

  it('#8 a font family keeps each run’s own size and marks', () => {
    const ed = open('<p><strong><span style="font-size: 14pt">Big bold</span></strong> plain</p>')
    applyStyle(ed, { from: 0, to: ed.state.doc.content.size }, { ...NO_STYLE, fontFamily: 'Times New Roman' })
    const runs: Array<{ text: string; marks: Record<string, Record<string, unknown>> }> = []
    ed.state.doc.descendants((node) => {
      if (node.isText) runs.push({ text: node.text ?? '', marks: Object.fromEntries(node.marks.map((mark) => [mark.type.name, mark.attrs])) })
    })
    expect(runs).toHaveLength(2)
    expect(runs[0].marks.bold).toBeDefined()
    expect(runs[0].marks.textStyle).toMatchObject({ fontFamily: 'Times New Roman', fontSize: '14pt' })
    expect(runs[1].marks.textStyle).toMatchObject({ fontFamily: 'Times New Roman' })
    expect(runs[1].marks.bold).toBeUndefined()
  })

  it('#9 capitalizing the title changes only the letters and keeps marks', () => {
    const ed = open('<p>IntelliDocs: An <em>Intelligent</em> Editor</p><p>Body.</p>')
    const title = resolveTargetRanges(ed.state.doc, 'title', 'title')
    applyFormatsToRanges(ed, title, ['align_center'], undefined, false, { ...NO_STYLE, textCase: 'upper' })
    const html = ed.getHTML()
    expect(html).toMatch(/<p style="text-align: center;?">INTELLIDOCS: AN <em>INTELLIGENT<\/em> EDITOR<\/p><p>Body\.<\/p>/)
  })
})

// Builds the whole 22-page V2 thesis in an editor: seconds on its own, longer in a parallel full run.
describe('section headings on the real V2 thesis import', { timeout: 20_000 }, () => {
  it('finds the bold-paragraph and H2/H3 section headings and skips front matter, chapter titles, tables and captions', () => {
    const html = gunzipSync(
      readFileSync(resolve(__dirname, '../../../../../tests/fixtures/import_baselines/editor_json/V2 INTELLIDOCS (2).docx.html.gz'))
    ).toString('utf-8')
    const ed = open(html)
    const texts = textsOf(ed, findCategoryRanges(ed.state.doc, 'sections'))
    for (const expected of ['Rationale of the Study', 'Objectives of the Study', 'Significance of the Study', 'Scope and Limitations of the Study', 'General Objective']) {
      expect(texts).toContain(expected)
    }
    for (const unexpected of ['INTRODUCTION', 'CHAPTER I', 'APPROVAL SHEET', 'Term', 'Figure 1: Conceptual Framework', 'REVIEW OF RELATED LITERATURE AND STUDIES']) {
      expect(texts).not.toContain(unexpected)
    }
  })

  it('resolves a named section or chapter to its real title line, not its table-of-contents entry', () => {
    const html = gunzipSync(
      readFileSync(resolve(__dirname, '../../../../../tests/fixtures/import_baselines/editor_json/V2 INTELLIDOCS (2).docx.html.gz'))
    ).toString('utf-8')
    const ed = open(html)
    // The table of contents lists "CHAPTER II: REVIEW OF RELATED LITERATURE AND STUDIES11" and
    // "Significance of the Study6" first; the chat must reach the headings themselves.
    expect(textsOf(ed, resolveTargetRanges(ed.state.doc, 'chapter 2', 'heading'))).toEqual(['CHAPTER II'])
    expect(textsOf(ed, resolveTargetRanges(ed.state.doc, 'significance of the study', 'heading'))).toEqual(['Significance of the Study'])
  })
})

describe('alignment on imported paragraphs', () => {
  it('a new alignment replaces the one Word wrote into the paragraph style', () => {
    const ed = open('<p style="text-align: justify; line-height: 2">Imported paragraph</p><h2 style="text-align: center">Imported heading</h2>')
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 })
    ed.commands.setTextAlign('left')
    const html = ed.getHTML()
    expect(html).not.toContain('justify')
    expect(html).not.toMatch(/text-align: center/)
    // Other imported block styles stay.
    expect(html).toContain('line-height: 2')
  })

  it('documents saved with the old style copy still show the new alignment', () => {
    const ed = open('<p>x</p>')
    ed.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'left', style: 'text-align: justify; line-height: 2' }, content: [{ type: 'text', text: 'Saved before the fix' }] }],
    })
    expect(ed.getHTML()).toMatch(/<p style="[^"]*text-align: left[^"]*">Saved before the fix<\/p>/)
    expect(ed.getHTML()).not.toContain('justify')
  })
})

describe('applyPresetToBody', () => {
  const UCLM_BODY = { fontFamily: 'Times New Roman', fontSize: '12pt', lineHeight: 2, firstLineIndent: '0.5in' }

  it('reformats body paragraphs only, keeping their other styles, in one undo step', () => {
    const ed = open(BENCHMARK_THESIS)
    const before = ed.getHTML()
    const depth = undoDepth(ed.state)
    const changed = applyPresetToBody(ed, UCLM_BODY)
    const html = ed.getHTML()
    // The fixture has 10 justified body paragraphs inside the chapters.
    expect(changed).toBe(10)
    expect(html).toMatch(/<p style="text-align: justify;? ?line-height: 2;? ?text-indent: 0\.5in;?"><span style="font-family: &quot;?Times New Roman&quot;?;? ?font-size: 12pt;?">Students spend/)
    // The title page, headings and bold heading lines are untouched.
    expect(html).toContain('<p>IntelliDocs: An Intelligent Document Editing System for Academic Manuscripts</p>')
    expect(html).toMatch(/<h2[^>]*>Scope and Delimitation<\/h2>/)
    expect(html).toContain('<p><strong>Statement of the Problem</strong></p>')
    expect(undoDepth(ed.state)).toBe(depth + 1)
    undo(ed.state, ed.view.dispatch)
    expect(ed.getHTML()).toBe(before)
  })

  it('leaves table cells alone', () => {
    const ed = open('<p>CHAPTER 1</p><p>Body paragraph long enough to be body text here.</p><table><tbody><tr><td><p>Cell text</p></td></tr></tbody></table>')
    expect(applyPresetToBody(ed, UCLM_BODY)).toBe(1)
    expect(ed.getHTML()).toMatch(/<td[^>]*><p>Cell text<\/p><\/td>/)
  })
})
