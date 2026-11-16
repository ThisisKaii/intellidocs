import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

import { editorExtensions } from '@/components/editor/TiptapEditor'
import type { EditorJson } from '@/services/api'
import { backMatterOpening, chapterOpening } from '../chapters'
import { insertTabBreaks, proposeChapterSplit, TAB_BREAK_TYPE } from '../documentTabs'

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function baselineJson(name: string): EditorJson {
  return JSON.parse(gunzipSync(readFileSync(resolve(__dirname, `../../../../tests/fixtures/import_baselines/editor_json/${name}.json.gz`))).toString('utf-8')) as EditorJson
}

const line = (text: string, type = 'paragraph') => ({ type, attrs: type === 'heading' ? { level: 1 } : {}, content: [{ type: 'text', text }] })

describe('recognising chapters', () => {
  it.each([
    ['CHAPTER I', 1],
    ['Chapter 2', 2],
    ['CHAPTER THREE', 3],
    ['CHAPTER IV: RESULTS AND DISCUSSION', 4],
  ])('opens a chapter on "%s"', (text, number) => {
    expect(chapterOpening(line(text))?.number).toBe(number)
  })

  it.each(['CHAPTER I: INTRODUCTION1', 'CHAPTER II REVIEW OF RELATED LITERATURE 11', 'The chapter one findings are discussed below in detail.'])(
    'ignores "%s" (contents entries and prose)',
    (text) => {
      expect(chapterOpening(line(text))).toBeNull()
    },
  )

  it('ignores a contents entry with a tab before its page number', () => {
    const entry = { type: 'paragraph', content: [{ type: 'text', text: 'CHAPTER I' }, { type: 'tab' }, { type: 'text', text: 'iv' }] }
    expect(chapterOpening(entry)).toBeNull()
  })

  it('finds back matter but not its contents entry', () => {
    expect(backMatterOpening(line('REFERENCES'))).toBe('REFERENCES')
    expect(backMatterOpening(line('REFERENCES105'))).toBeNull()
  })
})

describe('proposing a chapter split', () => {
  it('splits the V2 thesis into front matter and its chapters, each starting at its page break', () => {
    const doc = baselineJson('V2 INTELLIDOCS (2).docx')
    const tabs = proposeChapterSplit(doc)!
    expect(tabs.map((tab) => tab.title)).toEqual([
      'Front matter',
      'Chapter 1: Introduction',
      'Chapter 2: Review of Related Literature and Studies',
    ])
    const nodes = doc.content as Array<{ type: string }>
    // Each chapter's tab starts with the page break that puts it on a new page.
    expect(tabs.slice(1).map((tab) => nodes[tab.start].type)).toEqual(['pageBreak', 'pageBreak'])
  })

  it('needs at least two chapters', () => {
    expect(proposeChapterSplit({ type: 'doc', content: [line('CHAPTER I', 'heading'), line('Text')] })).toBeNull()
  })

  it('gives each back-matter section after the last chapter its own tab', () => {
    const doc: EditorJson = {
      type: 'doc',
      content: [line('Title page'), line('CHAPTER I', 'heading'), line('One'), line('CHAPTER II', 'heading'), line('Two'), line('REFERENCES', 'heading'), line('[1] A source.'), line('APPENDICES', 'heading'), line('A. Letter')],
    }
    expect(proposeChapterSplit(doc)!.map((tab) => [tab.title, tab.start])).toEqual([
      ['Front matter', 0],
      ['Chapter 1', 1],
      ['Chapter 2', 3],
      ['References', 5],
      ['Appendices', 7],
    ])
  })

  it('places one marker per tab and changes nothing else; the editor keeps the markers', () => {
    const doc = baselineJson('V2 INTELLIDOCS (2).docx')
    const tabs = proposeChapterSplit(doc)!
    const split = insertTabBreaks(doc, tabs)
    const content = split.content as Array<{ type: string }>
    expect(content.filter((node) => node.type === TAB_BREAK_TYPE)).toHaveLength(tabs.length)
    expect(content.filter((node) => node.type !== TAB_BREAK_TYPE)).toEqual(doc.content)

    // Loaded into the editor (a document opened before Phase 2 shows the whole body), the markers
    // survive a round trip and serialise in the format the server splits at.
    editor = new Editor({ extensions: editorExtensions, content: split })
    const json = editor.getJSON()
    expect((json.content ?? []).filter((node) => node.type === TAB_BREAK_TYPE).map((node) => node.attrs?.title)).toEqual(tabs.map((tab) => tab.title))
    expect(editor.getHTML().match(/<div data-tab-break=""[^>]*data-title="[^"]*"[^>]*><\/div>/g)).toHaveLength(tabs.length)
  })
})
