import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { CaptionExtension, captionLabel } from '../CaptionExtension'

const HTML =
  '<p data-caption-kind="table">Table 1. First</p><p>text</p><p data-caption-kind="table">Table 2. Second</p>' +
  '<p data-caption-kind="figure">Figure 1. A figure</p>'

/** An editor with the caption extension and a few captions. */
function createEditor(): Editor {
  return new Editor({ extensions: [StarterKit, CaptionExtension], content: HTML })
}

/** Text of every caption paragraph, in order. */
function captionTexts(editor: Editor): string[] {
  const texts: string[] = []
  editor.state.doc.forEach((node) => {
    if (node.attrs.captionKind) texts.push(node.textContent)
  })
  return texts
}

describe('caption labels', () => {
  it('builds default and IEEE labels', () => {
    expect(captionLabel('figure', 3, 'default')).toBe('Figure 3')
    expect(captionLabel('table', 3, 'default')).toBe('Table 3')
    expect(captionLabel('figure', 3, 'ieee')).toBe('Fig. 3')
    expect(captionLabel('table', 4, 'ieee')).toBe('TABLE IV')
  })

  it('rewrites every caption when the label style changes, and back', () => {
    const editor = createEditor()
    editor.commands.setCaptionLabelStyle('ieee')
    expect(captionTexts(editor)).toEqual(['TABLE I. First', 'TABLE II. Second', 'Fig. 1. A figure'])
    editor.commands.setCaptionLabelStyle('default')
    expect(captionTexts(editor)).toEqual(['Table 1. First', 'Table 2. Second', 'Figure 1. A figure'])
  })

  it('renumbers the rest when a caption is removed from the sequence', () => {
    const editor = createEditor()
    editor.commands.setCaptionLabelStyle('ieee')
    // Delete the first caption entirely: the second becomes TABLE I.
    editor.commands.setTextSelection({ from: 1, to: 1 + 'TABLE I. First'.length })
    editor.commands.deleteSelection()
    expect(captionTexts(editor)).toEqual(['TABLE I. Second', 'Fig. 1. A figure'])
  })
})
