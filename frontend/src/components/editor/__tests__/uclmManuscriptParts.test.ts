import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../TiptapEditor'
import { UCLM_CAPTIONS, findCaptions } from '../captionNumbering'
import { insertOrUpdateGenerated } from '../DocumentParts'
import { findAcademicPreset } from '../academicPresets'
import { manuscriptPageLabel } from '@/lib/pageLayout'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

describe('UCLM manuscript parts', () => {
  it('numbers the front matter i, ii, iii and the chapters 1, 2, 3 in a table of contents', () => {
    // Chapter I starts on page 9: pages 1-8 are the title page and the front matter.
    expect(manuscriptPageLabel(1, 9)).toBe('i')
    expect(manuscriptPageLabel(4, 9)).toBe('iv')
    expect(manuscriptPageLabel(8, 9)).toBe('viii')
    expect(manuscriptPageLabel(9, 9)).toBe('1')
    expect(manuscriptPageLabel(15, 9)).toBe('7')
    // No chapter yet: plain page numbers.
    expect(manuscriptPageLabel(3, null)).toBe('3')
  })

  it('starts a UCLM document with manuscript page numbers and UCLM captions', () => {
    const preset = findAcademicPreset('uclm_capstone')
    expect(preset?.pageNumbers).toBe('manuscript')
    expect(preset?.captions).toBe(UCLM_CAPTIONS)
  })

  it('writes a UCLM figure caption as "Figure 1: " with the title bold and underlined', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>Before</p><img src="https://example.org/a.png"><p>After</p>' })
    editor.storage.captions.labelStyle = UCLM_CAPTIONS
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'imageResize') at = pos
      return at < 0
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)))
    editor.commands.insertCaption('figure')
    editor.commands.insertContent('Use Case Diagram')
    const caption = editor.state.doc.child(2)
    expect(caption.attrs).toMatchObject({ captionKind: 'figure', textAlign: 'center' })
    expect(caption.textContent).toBe('Figure 1: Use Case Diagram')
    expect(caption.child(0).marks).toEqual([])
    expect(caption.lastChild!.marks.map((mark) => mark.type.name).sort()).toEqual(['bold', 'underline'])
    expect(findCaptions(editor.state.doc).map((entry) => entry.label)).toEqual(['Figure 1'])
  })

  it('fills the template\'s own TABLE OF CONTENTS heading instead of inserting at the caret', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content:
        '<h1>TITLE</h1><h1>TABLE OF CONTENTS</h1><p>Generate this from Tools, Document parts, once the chapters are written.</p>' +
        '<h1>CHAPTER I: INTRODUCTION</h1><h2>Rationale of the Study</h2><p>Text.</p>',
    })
    // The caret is on the title, at the top: the list must still go under its heading.
    editor.commands.setTextSelection(2)
    const nodes = [
      { type: 'paragraph', attrs: { generated: 'toc', textAlign: 'center' }, content: [{ type: 'text', text: 'TABLE OF CONTENTS' }] },
      { type: 'paragraph', attrs: { generated: 'toc' }, content: [{ type: 'text', text: 'CHAPTER I: INTRODUCTION' }] },
    ]
    expect(insertOrUpdateGenerated(editor, 'toc', nodes)).toBe('heading')
    const texts: string[] = []
    editor.state.doc.forEach((node) => texts.push(`${node.type.name}:${node.textContent}`))
    expect(texts).toEqual([
      'heading:TITLE',
      'heading:TABLE OF CONTENTS',
      'paragraph:CHAPTER I: INTRODUCTION',
      'heading:CHAPTER I: INTRODUCTION',
      'heading:Rationale of the Study',
      'paragraph:Text.',
    ])
    // Refreshing it replaces the entries in place, still without a second title.
    expect(insertOrUpdateGenerated(editor, 'toc', nodes)).toBe('updated')
    const again: string[] = []
    editor.state.doc.forEach((node) => again.push(node.textContent))
    expect(again.filter((text) => text === 'TABLE OF CONTENTS')).toHaveLength(1)
    expect(again).toHaveLength(6)
  })
})
