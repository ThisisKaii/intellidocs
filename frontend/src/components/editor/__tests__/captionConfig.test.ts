import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../TiptapEditor'
import { APA_CAPTIONS, DEFAULT_CAPTIONS, IEEE_CAPTIONS, captionLabel, findCaptions, type CaptionConfig } from '../captionNumbering'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

const IMAGE = '<p>Before</p><img src="https://example.org/a.png"><p>After</p>'

function withCaptions(config: CaptionConfig, html = IMAGE): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  editor.storage.captions.labelStyle = config
  return editor
}

function selectImage(current: Editor): void {
  let at = -1
  current.state.doc.descendants((node, pos) => {
    if (at < 0 && node.type.name === 'imageResize') at = pos
    return at < 0
  })
  current.view.dispatch(current.state.tr.setSelection(NodeSelection.create(current.state.doc, at)))
}

/** Block names in order, with a caption's kind. */
function blocks(current: Editor): string[] {
  const out: string[] = []
  current.state.doc.forEach((node) => out.push(node.attrs.captionKind ? `caption:${node.attrs.captionKind}` : node.type.name))
  return out
}

describe('caption settings', () => {
  it('writes APA figure captions above the figure: bold label, title on the next line in italics, flush left', () => {
    const current = withCaptions(APA_CAPTIONS)
    selectImage(current)
    current.commands.insertCaption('figure')
    expect(blocks(current)).toEqual(['paragraph', 'caption:figure', 'imageResize', 'paragraph'])
    const caption = current.state.doc.child(1)
    expect(caption.attrs.textAlign).toBe('left')
    expect(caption.child(0).text).toBe('Figure 1')
    expect(caption.child(0).marks.map((mark) => mark.type.name)).toContain('bold')
    expect(caption.child(1).type.name).toBe('hardBreak')
    // The title typed next is italic.
    current.commands.insertContent('System Architecture')
    const title = current.state.doc.child(1).lastChild!
    expect(title.text).toBe('System Architecture')
    expect(title.marks.map((mark) => mark.type.name)).toEqual(['italic'])
    // Still a caption the numbering reads, with its title on the next line.
    expect(findCaptions(current.state.doc).map((entry) => entry.label)).toEqual(['Figure 1'])
  })

  it('writes IEEE figure captions below in 8pt and numbers tables in Roman numerals', () => {
    const current = withCaptions(IEEE_CAPTIONS)
    selectImage(current)
    current.commands.insertCaption('figure')
    expect(blocks(current)).toEqual(['paragraph', 'imageResize', 'caption:figure', 'paragraph'])
    const caption = current.state.doc.child(2)
    expect(caption.textContent).toBe('Fig. 1. ')
    expect(caption.child(0).marks.find((mark) => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('8pt')
    expect(captionLabel('table', 4, IEEE_CAPTIONS)).toBe('TABLE IV')
  })

  it('keeps the default exactly as before: "Figure 1. " below the figure, centred', () => {
    const current = withCaptions(DEFAULT_CAPTIONS)
    selectImage(current)
    current.commands.insertCaption('figure')
    const caption = current.state.doc.child(2)
    expect(caption.attrs).toMatchObject({ captionKind: 'figure', textAlign: 'center' })
    expect(caption.textContent).toBe('Figure 1. ')
    expect(caption.child(0).marks).toEqual([])
  })

  it('relabels existing captions to a custom label and reads every label word it offers', () => {
    const current = withCaptions(DEFAULT_CAPTIONS, '<p data-caption-kind="figure">Figure 1. Framework</p><p data-caption-kind="table">Table 1. Results</p>')
    const custom: CaptionConfig = {
      figure: { ...DEFAULT_CAPTIONS.figure, label: 'FIGURE' },
      table: { ...DEFAULT_CAPTIONS.table, label: 'Tab.', numerals: 'roman' },
    }
    current.commands.setCaptionLabelStyle(custom)
    expect(current.getText()).toContain('FIGURE 1. Framework')
    expect(current.getText()).toContain('Tab. I. Results')
    expect(findCaptions(current.state.doc).map((entry) => entry.label)).toEqual(['FIGURE 1', 'Tab. I'])
  })
})
