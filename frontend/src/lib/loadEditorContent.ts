import type { Editor } from '@tiptap/core'

/**
 * Put a document into the editor as a load, not an edit. Kept out of the undo history: recorded there,
 * undoing past the first edit steps back to the blank editor, and autosave then stores the empty
 * document over the real one.
 */
export function loadEditorContent(editor: Editor, html: string): void {
  editor.chain().setMeta('addToHistory', false).setContent(html, { emitUpdate: false }).run()
}
