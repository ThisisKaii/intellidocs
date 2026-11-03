import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { loadEditorContent } from './loadEditorContent'

/** An editor holding a loaded document, as PagedEditor has after opening one. */
function opened(): Editor {
  const editor = new Editor({ extensions: [StarterKit] })
  loadEditorContent(editor, '<p>The whole document.</p>')
  return editor
}

describe('loadEditorContent', () => {
  it('leaves nothing to undo, so undo cannot empty the document', () => {
    const editor = opened()
    expect(editor.can().undo()).toBe(false)
    editor.commands.undo()
    expect(editor.getText()).toBe('The whole document.')
  })

  it('undoes an edit back to the loaded document and no further', () => {
    const editor = opened()
    editor.commands.insertContentAt(1, 'New ')
    expect(editor.getText()).toBe('New The whole document.')
    editor.commands.undo()
    editor.commands.undo()
    editor.commands.undo()
    expect(editor.getText()).toBe('The whole document.')
  })

  it('does not report the load as an edit', () => {
    const editor = new Editor({ extensions: [StarterKit] })
    let updates = 0
    editor.on('update', () => {
      updates += 1
    })
    loadEditorContent(editor, '<p>Loaded.</p>')
    expect(updates).toBe(0)
  })
})
