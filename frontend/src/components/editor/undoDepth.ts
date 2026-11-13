import { undoDepth as historyUndoDepth } from '@tiptap/pm/history'
import type { EditorState } from '@tiptap/pm/state'
import { yUndoPluginKey } from '@tiptap/y-tiptap'

interface YUndoState {
  undoManager?: { undoStack: unknown[]; stopCapturing: () => void }
}

/** The Yjs undo manager when the editor is collaborative (it replaces ProseMirror's history). */
function yUndoManager(state: EditorState): YUndoState['undoManager'] | null {
  return (yUndoPluginKey.getState(state) as YUndoState | undefined)?.undoManager ?? null
}

/** Number of undoable steps, from whichever undo history the editor runs. */
export function editorUndoDepth(state: EditorState): number {
  const manager = yUndoManager(state)
  return manager ? manager.undoStack.length : historyUndoDepth(state)
}

/**
 * Make the next change its own undo step. Yjs merges edits made within half a second into one
 * step, so an AI change applied right after typing would otherwise be undone together with it.
 */
export function startNewUndoStep(state: EditorState): void {
  yUndoManager(state)?.stopCapturing()
}
