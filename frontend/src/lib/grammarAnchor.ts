import type { Editor } from '@tiptap/core'

/**
 * The occurrence of `needle` in a text block that contains (or is nearest to) the clicked offset,
 * as offsets within the block, or null when the block does not contain it.
 */
export function occurrenceNear(blockText: string, needle: string, clickOffset: number): { start: number; end: number } | null {
  const haystack = blockText.toLowerCase()
  const target = needle.toLowerCase()
  if (!target) return null
  let best: { start: number; end: number } | null = null
  let bestDistance = Infinity
  for (let index = haystack.indexOf(target); index !== -1; index = haystack.indexOf(target, index + 1)) {
    const end = index + target.length
    const distance = clickOffset < index ? index - clickOffset : clickOffset > end ? clickOffset - end : 0
    if (distance < bestDistance) {
      best = { start: index, end }
      bestDistance = distance
    }
  }
  return best
}

/**
 * The document range of the grammar issue the user clicked: the occurrence of its text in the
 * clicked block nearest the click point. Falls back to the clicked position when the text is not
 * found there (the underline still marks roughly the right place).
 */
export function anchorAtClick(editor: Editor, issue: { original: string }, rect: DOMRect): { from: number; to: number } | null {
  const hit = editor.view.posAtCoords({ left: rect.left + Math.min(4, rect.width / 2), top: rect.top + rect.height / 2 })
  if (!hit) return null
  const $pos = editor.state.doc.resolve(hit.pos)
  const block = $pos.parent
  if (!block.isTextblock) return { from: hit.pos, to: hit.pos + issue.original.length }
  const blockStart = $pos.start()
  // Inline atoms (tabs, math) take one position each: a one-character stand-in keeps offsets aligned.
  const text = block.textBetween(0, block.content.size, undefined, '￼')
  const found = occurrenceNear(text, issue.original.trim(), hit.pos - blockStart)
  if (!found) return { from: hit.pos, to: Math.min(hit.pos + issue.original.length, $pos.end()) }
  return { from: blockStart + found.start, to: blockStart + found.end }
}
