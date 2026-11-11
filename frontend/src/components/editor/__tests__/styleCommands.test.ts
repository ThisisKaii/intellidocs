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

describe('applyStyleCommand clears the previous look', () => {
  it('Title → Normal drops the centering and the title role', () => {
    const ed = styled('title')
    ed.commands.setTextSelection(3)
    applyStyleCommand(ed, 'normal')
    const block = ed.state.doc.firstChild
    expect(block?.type.name).toBe('paragraph')
    expect(block?.attrs.textAlign ?? null).not.toBe('center')
    expect(block?.attrs.docRole ?? null).toBeNull()
  })

  it('Title → Heading 1 clears the title role and its centering', () => {
    const ed = styled('title')
    ed.commands.setTextSelection(3)
    applyStyleCommand(ed, 'h1')
    const block = ed.state.doc.firstChild
    expect(block?.attrs).toMatchObject({ level: 1, docRole: null })
    expect(block?.attrs.textAlign ?? null).not.toBe('center')
  })

  it('a bold, resized paragraph becomes a clean Heading 2 with no inline marks', () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: '<p><strong><span style="font-size: 18pt">Big bold</span></strong></p><p>Body</p>',
    })
    editor.commands.setTextSelection(3)
    applyStyleCommand(editor, 'h2')
    const block = editor.state.doc.firstChild
    expect(block?.type.name).toBe('heading')
    const marks = block?.firstChild?.marks.map((m) => m.type.name) ?? []
    expect(marks).not.toContain('bold')
    expect(marks).not.toContain('textStyle')
  })

  it('Caption → Normal clears the italic, size, centering and caption role', () => {
    const ed = styled('caption')
    ed.commands.setTextSelection(3)
    applyStyleCommand(ed, 'normal')
    const block = ed.state.doc.firstChild
    expect(block?.type.name).toBe('paragraph')
    expect(block?.attrs.captionKind ?? null).toBeNull()
    expect(block?.attrs.textAlign ?? null).not.toBe('center')
    const marks = block?.firstChild?.marks.map((m) => m.type.name) ?? []
    expect(marks).not.toContain('italic')
    expect(marks).not.toContain('textStyle')
  })

  it('heading buttons from the bubble menu keep the preset look (via the preset registry)', () => {
    const ed = styled('h1', 'uclm_capstone')
    expect(ed.state.doc.firstChild?.attrs.textAlign).toBe('center')
  })
})
