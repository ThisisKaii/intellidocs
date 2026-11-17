import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../TiptapEditor'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** The position and node of the first picture in the document. */
function firstPicture(current: Editor): { pos: number; attrs: Record<string, unknown> } | null {
  let found: { pos: number; attrs: Record<string, unknown> } | null = null
  current.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === 'imageResize') found = { pos, attrs: node.attrs }
    return !found
  })
  return found
}

function selectPicture(current: Editor): void {
  const picture = firstPicture(current)!
  current.view.dispatch(current.state.tr.setSelection(NodeSelection.create(current.state.doc, picture.pos)))
}

describe('picture slots', () => {
  it('reads a slot a template tagged, and keeps the tag when saved', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: '<p>Intro</p><img src="https://example.org/dummy.png" data-placeholder-slot="true" data-slot-label="System Architecture Diagram"><p>After</p>',
    })
    expect(firstPicture(editor)?.attrs).toMatchObject({ placeholderSlot: true, slotLabel: 'System Architecture Diagram' })
    const html = editor.getHTML()
    expect(html).toContain('data-placeholder-slot="true"')
    expect(html).toContain('data-slot-label="System Architecture Diagram"')
  })

  it('inserts an empty slot showing its label', () => {
    editor = new Editor({ extensions: editorExtensions, content: '<p>Text</p>' })
    editor.commands.setTextSelection(5)
    editor.commands.insertPictureSlot('Data Flow Diagram')
    const slot = firstPicture(editor)!
    expect(slot.attrs).toMatchObject({ placeholderSlot: true, slotLabel: 'Data Flow Diagram' })
    expect(decodeURIComponent(String(slot.attrs.src))).toContain('Data Flow Diagram')
  })

  it('takes a picture without losing its width or caption, and becomes an ordinary picture', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: '<img src="https://example.org/dummy.png" data-placeholder-slot="true" data-slot-label="Figure" containerstyle="width: 300px; height: auto; display: block; margin: 0 auto;"><p data-caption-kind="figure">Figure 1. Architecture</p>',
    })
    selectPicture(editor)
    const style = firstPicture(editor)!.attrs.containerStyle
    expect(editor.commands.fillPictureSlot('https://cdn.example.org/real.png')).toBe(true)
    const filled = firstPicture(editor)!
    expect(filled.attrs).toMatchObject({ src: 'https://cdn.example.org/real.png', placeholderSlot: null, slotLabel: null, containerStyle: style })
    expect(editor.getText()).toContain('Figure 1. Architecture')
    // An ordinary picture is not a slot: filling again does nothing.
    selectPicture(editor)
    expect(editor.commands.fillPictureSlot('https://cdn.example.org/other.png')).toBe(false)
  })

  it('removes a slot together with its caption, and nothing else', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: '<p>Before</p><img src="https://example.org/dummy.png" data-placeholder-slot="true"><p data-caption-kind="figure">Figure 1. To be added</p><p>After</p>',
    })
    selectPicture(editor)
    expect(editor.commands.removePictureSlot()).toBe(true)
    expect(firstPicture(editor)).toBeNull()
    expect(editor.getText()).not.toContain('Figure 1')
    expect(editor.getText()).toContain('Before')
    expect(editor.getText()).toContain('After')
  })
})
