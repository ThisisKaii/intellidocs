import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { editorExtensions } from '../TiptapEditor'
import { applyStyleCommand } from '../styleCommands'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function styled(format: string, presetKey: string | null = null, html = '<p>My Thesis Title</p><p>Body</p>'): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  editor.commands.setTextSelection(3)
  applyStyleCommand(editor, format, undefined, undefined, presetKey)
  return editor
}

describe('applyStyleCommand', () => {
  it('Title marks the block as the document title, centered, as a chosen style', () => {
    const block = styled('title').state.doc.firstChild
    expect(block?.type.name).toBe('heading')
    expect(block?.attrs).toMatchObject({ level: 1, docRole: 'title', styleSource: 'applied_style', textAlign: 'center' })
    expect(String(block?.attrs.style)).toContain('font-size:20pt')
    // Alignment lives in TextAlign, never inside the inline style.
    expect(String(block?.attrs.style)).not.toContain('text-align')
  })

  it('Heading 2 gets its look and is not the title', () => {
    const block = styled('h2').state.doc.firstChild
    expect(block?.attrs).toMatchObject({ level: 2, docRole: null, styleSource: 'applied_style' })
    expect(String(block?.attrs.style)).toContain('font-size:14.5pt')
  })

  it('takes a preset heading look, alignment included', () => {
    const block = styled('h1', 'uclm_capstone').state.doc.firstChild
    expect(block?.attrs.textAlign).toBe('center')
    expect(String(block?.attrs.style)).toContain('font-size:12pt')
  })

  it('Normal turns a heading back into plain body text without its heading look', () => {
    const ed = styled('h1')
    ed.commands.setTextSelection(3)
    applyStyleCommand(ed, 'normal')
    const block = ed.state.doc.firstChild
    expect(block?.type.name).toBe('paragraph')
    expect(block?.attrs).toMatchObject({ style: null, styleSource: 'applied_style' })
  })
})
