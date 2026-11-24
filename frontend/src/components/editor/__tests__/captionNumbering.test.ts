import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import Image from '@tiptap/extension-image'

import { CaptionExtension } from '../CaptionExtension'
import { findCaptions, labelForNewCaption, misnumberedCaptions } from '../captionNumbering'

function editorWith(html: string): Editor {
  return new Editor({ extensions: [StarterKit, Image, CaptionExtension], content: html })
}

function texts(editor: Editor): string[] {
  const out: string[] = []
  editor.state.doc.forEach((node) => out.push(node.textContent))
  return out
}

describe('recognising the captions a document came with', () => {
  it('counts "Figure N:" paragraphs and ignores prose and list-of-figures entries', () => {
    const editor = editorWith(
      '<p>Figure 1. Framework ........ 23</p>' +
        '<p>Figure 1: Conceptual Framework</p>' +
        '<p>Figure 1 shows how the parts of the framework connect to each other in the study.</p>' +
        '<p>Figure 2: Comet</p>',
    )
    expect(findCaptions(editor.state.doc).map((entry) => entry.label)).toEqual(['Figure 1', 'Figure 2'])
  })

  it('counts manuscript table captions whose title follows in capitals or on the next line', () => {
    const editor = editorWith(
      '<p>Table 1 COMPARATIVE MATRIX</p>' +
        '<p>Table 2<br>SCORING POINTS</p>' +
        '<p>Table 2 shows the scoring points each respondent could give.</p>' +
        '<p>Table 3 A summary of the answers</p>',
    )
    expect(findCaptions(editor.state.doc).map((entry) => entry.label)).toEqual(['Table 1', 'Table 2'])
  })

  it('finds a figure number that does not follow from its place', () => {
    const editor = editorWith(
      '<p>Figure 1: A</p><p>Figure 2: B</p><p>Figure 3: C</p><p>Figure 4: D</p><p>Figure 4: DocEdit-v2</p><p>Figure 3: ReWriteLM</p>',
    )
    const fixes = misnumberedCaptions(findCaptions(editor.state.doc), 'default')
    expect(fixes.map((fix) => [fix.entry.node.textContent, fix.expected])).toEqual([
      ['Figure 4: DocEdit-v2', 'Figure 5'],
      ['Figure 3: ReWriteLM', 'Figure 6'],
    ])
  })

  it('follows chapter numbering when the document uses it', () => {
    const editor = editorWith(
      '<h1>Chapter 2</h1><p>Figure 2.1: A</p><p>Figure 2.2: B</p><h1>Chapter 3</h1><p>Figure 3.1: C</p><p>Figure 3.3: D</p>',
    )
    const fixes = misnumberedCaptions(findCaptions(editor.state.doc), 'default')
    expect(fixes.map((fix) => fix.expected)).toEqual(['Figure 3.2'])
    const end = editor.state.doc.content.size
    expect(labelForNewCaption(editor.state.doc, 'figure', end, 'default')).toBe('Figure 3.3')
  })

  it('accepts numbers that start again in each chapter', () => {
    const editor = editorWith('<h1>Chapter 1</h1><p>Table 1. A</p><p>Table 2. B</p><h1>Chapter 2</h1><p>Table 1. C</p>')
    expect(misnumberedCaptions(findCaptions(editor.state.doc), 'default')).toEqual([])
  })
})

describe('inserting a caption into a document that already has some', () => {
  it('numbers it after the existing captions and moves the later ones on', () => {
    const editor = editorWith(
      '<p>Figure 1: First</p><img src="a.png"><p>Figure 2: Second</p><p>end</p>',
    )
    // Select the image (between the two captions) and caption it.
    let imagePos = -1
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'image') imagePos = offset
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imagePos)))
    editor.commands.insertCaption('figure')
    expect(texts(editor)).toEqual(['Figure 1: First', '', 'Figure 2. ', 'Figure 3: Second', 'end'])
  })

  it('does not renumber a caption while it is typed by hand', () => {
    const editor = editorWith('<p>Figure 1: First</p><p>Figure 2: Second</p><p></p>')
    const end = editor.state.doc.content.size - 1
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)))
    editor.commands.insertContent('Figure 1: Typed')
    expect(texts(editor)[2]).toBe('Figure 1: Typed')
  })
})

describe('captions in one tab of a document split into tabs', () => {
  it('continues the numbering after the figures of the tabs before it', () => {
    const editor = editorWith('<p>Figure 5: A</p><p>Figure 6: B</p>')
    const context = { offsets: { figure: 4, table: 0 }, schemes: { figure: 'sequence' as const } }
    expect(misnumberedCaptions(findCaptions(editor.state.doc), 'default', false, context)).toEqual([])
    // Without knowing the earlier tabs, the same chapter would look misnumbered.
    expect(misnumberedCaptions(findCaptions(editor.state.doc), 'default').map((fix) => fix.expected)).toEqual(['Figure 1', 'Figure 2'])
    expect(labelForNewCaption(editor.state.doc, 'figure', editor.state.doc.content.size, 'default', context)).toBe('Figure 7')
  })

  it('leaves a chapter that restarts at 1 alone when the document restarts per chapter', () => {
    const editor = editorWith('<h1>Chapter 3</h1><p>Table 1. A</p><p>Table 2. B</p>')
    const context = { offsets: { figure: 0, table: 6 }, schemes: { table: 'restart' as const } }
    expect(misnumberedCaptions(findCaptions(editor.state.doc), 'default', false, context)).toEqual([])
  })
})

describe('editing a caption label by hand', () => {
  function positionOf(editor: Editor, text: string): number {
    let found = -1
    editor.state.doc.forEach((node, offset) => {
      if (node.textContent === text) found = offset + 1
    })
    return found
  }

  it('leaves the other captions alone while a label is typed over', () => {
    const editor = editorWith('<p>Table 1: A</p><p>Table 2: B</p><p>Table 3: C</p>')
    const start = positionOf(editor, 'Table 2: B')
    // Select "Table 2" and type the first letter of the new label over it.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start, start + 7)))
    editor.view.dispatch(editor.state.tr.insertText('T'))
    expect(texts(editor)).toEqual(['Table 1: A', 'T: B', 'Table 3: C'])
  })

  it('still renumbers the captions after one whose paragraph is deleted', () => {
    const editor = editorWith('<p>Table 1: A</p><p>Table 2: B</p><p>Table 3: C</p>')
    const start = positionOf(editor, 'Table 1: A') - 1
    editor.view.dispatch(editor.state.tr.delete(start, start + editor.state.doc.child(0).nodeSize))
    expect(texts(editor)).toEqual(['Table 1: B', 'Table 2: C'])
  })
})
