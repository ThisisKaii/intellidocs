import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection, type EditorState } from '@tiptap/pm/state'

/**
 * A block range (the edges a suggestion or scanner gives: before the first block, after the
 * last) moved inside the text it covers. A text selection whose ends sit between blocks makes
 * chained block commands misbehave: after the first change in the chain, setHeading and
 * setTextAlign silently do nothing, so a "Format as Title" cleared the alignment and stopped.
 */
export function textRangeInside(doc: ProseMirrorNode, from: number, to: number): { from: number; to: number } {
  const size = doc.content.size
  const $from = doc.resolve(Math.max(0, Math.min(from, size)))
  const $to = doc.resolve(Math.max(0, Math.min(to, size)))
  const start = $from.parent.inlineContent ? $from.pos : Selection.findFrom($from, 1, true)?.from ?? $from.pos
  const end = $to.parent.inlineContent ? $to.pos : Selection.findFrom($to, -1, true)?.to ?? $to.pos
  return start <= end ? { from: start, to: end } : { from: start, to: start }
}

/**
 * Visit the nodes in every range of the selection. A text selection has one range; a selection
 * of several table cells has one per cell, while `selection.from`/`to` cover only the first, so
 * commands that read from/to change only the first cell.
 */
export function forEachSelectedNode(
  state: EditorState,
  visit: (node: ProseMirrorNode, pos: number) => boolean | void
): void {
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, visit)
  }
}
