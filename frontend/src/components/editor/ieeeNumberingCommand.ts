import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import {
  applyIeeeNumberingToTexts,
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

    found.push({
      level: level as IeeeHeadingLevel,
      text: node.textContent,
      from: pos + 1,
      to: pos + 1 + node.content.size,
    })
    return false
  })

  return found
}

/**
 * Renumbers the document's headings to IEEE convention, rewriting each
 * heading's text in place.
 *
 * Existing numbers are stripped first, so running this twice is a no-op
 * rather than doubling the label. Returns true when any heading text changed,
 * which lets the caller skip a no-op transaction and its behavior event.
 */
export function applyIeeeNumbering(editor: Editor): boolean {
  const headings = collectHeadings(editor.state.doc)
  if (headings.length === 0) {
    return false
  }

  const nextTexts = applyIeeeNumberingToTexts(headings)

  const tr = editor.state.tr
  let changed = false

  headings.forEach((heading, index) => {
    const next = nextTexts[index]
    if (next === heading.text) {
      return
    }
    tr.insertText(next, heading.from, heading.to)
    changed = true
  })

  if (!changed) {
    return false
  }

  editor.view.dispatch(tr)
  return true
}
