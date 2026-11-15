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
