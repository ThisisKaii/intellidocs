import type { Editor, JSONContent } from '@tiptap/core'

/**
 * Put a document into the editor as a load, not an edit. Kept out of the undo history: recorded there,
 * undoing past the first edit steps back to the blank editor, and autosave then stores the empty
 * document over the real one.
 *
 * The editor's saved JSON is loaded in preference to the HTML: it holds every node and attribute
 * exactly, where parsing the HTML back can drift (a table cell's padding once came back as a
 * shorthand the editor dropped). JSON the current schema rejects, such as JSON saved before a node
 * changed shape, is skipped for the HTML, so a document always opens. Returns which form loaded.
 */
export function loadEditorContent(editor: Editor, html: string, json?: JSONContent | null): 'json' | 'html' {
  let content: string | JSONContent = html
  if (json) {
    try {
      editor.schema.nodeFromJSON(json).check()
      content = json
    } catch (error) {
      console.warn('Saved editor JSON does not fit the editor schema; loading the HTML instead.', error)
    }
  }
  editor.chain().setMeta('addToHistory', false).setContent(content, { emitUpdate: false }).run()
  return content === html ? 'html' : 'json'
}
