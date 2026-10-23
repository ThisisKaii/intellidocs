import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import {
  applyIeeeNumberingToTexts,
  leadingNumberLength,
  type IeeeHeadingLevel,
  type IeeeHeadingText,
} from './ieeeNumbering'

/** A heading located in the document, with its absolute content range. */
interface LocatedHeading extends IeeeHeadingText {
  from: number
  to: number
}

const HEADING_LEVELS: ReadonlySet<number> = new Set([1, 2, 3])

/** Collects every level 1-3 heading in the document, in document order. */
function collectHeadings(doc: ProseMirrorNode): LocatedHeading[] {
  const found: LocatedHeading[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return true
    }

    const level = node.attrs['level']
    if (typeof level !== 'number' || !HEADING_LEVELS.has(level)) {
      return true
    }

    const docRole = node.attrs['docRole']
    found.push({
      level: level as IeeeHeadingLevel,
      text: node.textContent,
      unnumbered: docRole === 'title',
      from: pos + 1,
      to: pos + 1 + node.content.size,
    })
    return false
  })

  return found
}

/**
 * Renumbers the document's headings to IEEE convention.
 *
 * Only each heading's leading label ("I. ", "A. ", "1) ") is replaced, so bold,
 * italic and links inside the heading survive. Edits are applied from the last
 * heading to the first, because an edit that changes a label's length would
 * otherwise shift the positions of every heading after it.
 *
 * Existing numbers are stripped first, so running this twice is a no-op.
 * Returns true when any heading changed, which lets the caller skip a no-op
 * transaction and its behavior event.
 */
export function applyIeeeNumbering(editor: Editor): boolean {
  const headings = collectHeadings(editor.state.doc)
  if (headings.length === 0) {
    return false
  }

  const nextTexts = applyIeeeNumberingToTexts(headings)

  const tr = editor.state.tr
  let changed = false

  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const heading = headings[index]
    const next = nextTexts[index]
    if (next === heading.text.trim()) {
      continue
    }

    const oldLabelLength = leadingNumberLength(heading.text)
    const nextLabelLength = leadingNumberLength(next)
    const nextLabel = next.slice(0, nextLabelLength)
    if (heading.text.slice(0, oldLabelLength) === nextLabel) {
      continue
    }

    if (nextLabel === '') {
      tr.delete(heading.from, heading.from + oldLabelLength)
    } else {
      tr.insertText(nextLabel, heading.from, heading.from + oldLabelLength)
    }
    changed = true
  }

  if (!changed) {
    return false
  }

  editor.view.dispatch(tr)
  return true
}
