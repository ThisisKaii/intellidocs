import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { undo } from '@tiptap/pm/history'
import { editorExtensions } from '../TiptapEditor'
import { APA_CAPTIONS, DEFAULT_CAPTIONS, type CaptionConfig } from '../captionNumbering'
import { captionsWithoutTitle, planAutoCaptions } from '../autoCaption'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function open(html: string, config: CaptionConfig = DEFAULT_CAPTIONS): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  editor.storage.captions.labelStyle = config
  return editor
}

/** Each top-level block's text, with pictures and tables named. */
function lines(current: Editor): string[] {
  const out: string[] = []
  current.state.doc.forEach((node) => {
    if (node.type.name === 'imageResize') out.push(`[picture ${node.attrs.alt ?? ''}]`.replace(' ]', ']'))
    else if (node.type.name === 'table') out.push('[table]')
    else if (node.textContent.trim()) out.push(node.textContent)
  })
  return out
}

const img = (alt = '', width = 400): string => `<img src="https://example.org/a.png" alt="${alt}" width="${width}">`
const TABLE = '<table><tbody><tr><th>Year</th><th>Count</th></tr><tr><td>1</td><td>20</td></tr></tbody></table>'
const TITLED_TABLE = '<table><tbody><tr><td colspan="2">Respondents by year level</td></tr><tr><td>1</td><td>20</td></tr></tbody></table>'

describe('planAutoCaptions', () => {
  it('finds figures and tables with no caption and skips the captioned ones', () => {
    const current = open(`<p>Intro.</p>${img('Survey flow')}<p>Figure 1. Existing</p>${img()}<p>Text.</p>${TABLE}`)
    const items = planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS)
    expect(items.map((item) => [item.kind, item.title])).toEqual([
      ['figure', null],
      ['table', null],
    ])
  })

  it('takes titles only from the user’s own words: alt text, never file names, generic words or Word’s machine descriptions', () => {
    const current = open(
      `<p>a</p>${img('Survey flow of the study')}<p>b</p>${img('image1.png')}<p>c</p>${img('Picture 3')}<p>d</p>${img('A picture containing text. Description automatically generated')}<p>e</p>${img('Figure 7: Network layout')}`
    )
    expect(planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS).map((item) => item.title)).toEqual([
      'Survey flow of the study',
      null,
      null,
      null,
      'Network layout',
    ])
  })

  it('uses a table’s title row, and treats a "Table 3: ..." first row as its caption', () => {
    const current = open(`<p>a</p>${TITLED_TABLE}<p>b</p><table><tbody><tr><td colspan="2">Table 3: Already captioned</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>`)
    expect(planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS)).toEqual([
      expect.objectContaining({ kind: 'table', title: 'Respondents by year level', titleSource: 'title row' }),
    ])
  })

  it('gives stacked pictures one caption, and leaves logos and the front matter alone', () => {
    const current = open(`${img('University logo')}<p>CHAPTER 1</p><p>a</p>${img('Left panel')}${img('Right panel')}<p>b</p>${img('Icon', 48)}`)
    expect(planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS).map((item) => item.title)).toEqual(['Left panel'])
  })

  it('only the kinds asked for', () => {
    const current = open(`<p>a</p>${img('Flow')}<p>b</p>${TABLE}`)
    expect(planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS, ['table']).map((item) => item.kind)).toEqual(['table'])
  })
})

describe('insertAutoCaptions', () => {
  it('captions everything in one step, numbered in order, below figures and above tables', () => {
    const current = open(`<p>Intro.</p>${img('Survey flow')}<p>Middle.</p><p>Figure 1. Existing</p>${img()}<p>Text.</p>${TABLE}`)
    // The existing caption sits below the picture before it, so that picture is captioned.
    const html = `<p>Intro.</p>${img('Survey flow')}<p>Middle.</p>${img()}<p>Figure 1. Existing</p><p>Text.</p>${TABLE}`
    current.commands.setContent(html)
    expect(current.commands.insertAutoCaptions()).toBe(true)
    expect(lines(current)).toEqual([
      'Intro.',
      '[picture Survey flow]',
      'Figure 1. Survey flow',
      'Middle.',
      '[picture]',
      'Figure 2. Existing',
      'Text.',
      'Table 1. ',
      '[table]',
    ])
    expect(captionsWithoutTitle(current.state.doc)).toHaveLength(1)
    // One undo takes every caption back.
    undo(current.state, current.view.dispatch)
    expect(lines(current).filter((line) => /^(Figure|Table) \d/.test(line))).toEqual(['Figure 1. Existing'])
  })

  it('moves a table’s title row into its caption instead of writing the title twice', () => {
    const current = open(`<p>a</p>${TITLED_TABLE}`)
    current.commands.insertAutoCaptions(['table'])
    expect(lines(current)).toEqual(['a', 'Table 1. Respondents by year level', '[table]'])
    let rows = 0
    current.state.doc.descendants((node) => {
      if (node.type.name === 'tableRow') rows += 1
      return true
    })
    expect(rows).toBe(1)
    expect(current.getText()).not.toMatch(/Respondents by year level[\s\S]*Respondents by year level/)
  })

  it('keeps a title row that is the whole table', () => {
    const current = open('<p>a</p><table><tbody><tr><td>Only row</td></tr></tbody></table>')
    current.commands.insertAutoCaptions(['table'])
    expect(current.getText()).toMatch(/Table 1\. Only row[\s\S]*Only row/)
  })

  it('writes captions in the document’s caption style', () => {
    const current = open(`<p>a</p>${img('Survey flow')}`, APA_CAPTIONS)
    current.commands.insertAutoCaptions(['figure'])
    const html = current.getHTML()
    // APA: above the figure, bold label, title on the next line in italics.
    expect(html).toMatch(/<p[^>]*data-caption-kind="figure"[^>]*><strong>Figure 1<\/strong><br><em>Survey flow<\/em><\/p><img/)
  })

  it('does nothing when everything is captioned', () => {
    const current = open(`<p>a</p>${img('Flow')}<p>Figure 1. Flow</p>`)
    expect(current.commands.insertAutoCaptions()).toBe(false)
  })
})

describe('tables that are not counted', () => {
  it('leaves Definition of Terms, list sections and generated lists uncaptioned', () => {
    const current = open(
      `<h1>CHAPTER I</h1><h2>Definition of Terms</h2>${TABLE}` +
        `<h2>LIST OF TABLES</h2><table data-generated="lot"><tbody><tr><th>Table No.</th><th>Name</th><th>Page No.</th></tr></tbody></table>` +
        `<h2>Results</h2>${TABLE}`
    )
    const items = planAutoCaptions(current.state.doc, DEFAULT_CAPTIONS)
    // Only the table under "Results" is a table of the study.
    expect(items).toHaveLength(1)
    let resultsTable = -1
    current.state.doc.forEach((node, pos) => {
      if (node.type.name === 'table') resultsTable = pos
    })
    expect(items[0].from).toBe(resultsTable)
  })
})
