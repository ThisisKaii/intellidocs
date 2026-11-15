import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * What a transaction changed, so plugins redo their work on those blocks only.
 *
 * Walking the whole document after every keystroke is what makes a long manuscript lag: at a
 * thousand pages each full walk costs several milliseconds, and the editor had half a dozen of
 * them per key. These helpers give the ranges a transaction touched, widened to whole top-level
 * blocks, and keep a decoration set up to date by rebuilding only inside them.
 */

export interface Range {
  from: number
  to: number
}

/** Ranges of `tr.doc` the transaction's steps changed (replacements, attribute and mark changes). */
export function changedRanges(tr: Transaction): Range[] {
  const ranges: Range[] = []
  tr.steps.forEach((step, index) => {
    const map = tr.mapping.maps[index]
    for (const range of ranges) {
      range.from = map.map(range.from, -1)
      range.to = map.map(range.to, 1)
    }
    let mapped = false
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: newStart, to: newEnd })
      mapped = true
    })
    if (!mapped) {
      // Attribute and mark steps move nothing, so their map is empty: use the step's own place.
      const own = step as unknown as { pos?: number; from?: number; to?: number }
      if (typeof own.pos === 'number') ranges.push({ from: own.pos, to: own.pos + 1 })
      else if (typeof own.from === 'number' && typeof own.to === 'number') ranges.push({ from: own.from, to: own.to })
    }
  })
  return ranges
}

/**
 * The ranges widened to whole top-level blocks (plus `context` blocks either side), sorted and
 * merged. A block nested in a table or wrap block counts as its top-level ancestor.
 */
export function topLevelRanges(doc: ProseMirrorNode, ranges: Range[], context = 0): Range[] {
  const size = doc.content.size
  const widened: Range[] = []
  for (const range of ranges) {
    const from = Math.max(0, Math.min(size, Math.min(range.from, range.to)))
    const to = Math.max(0, Math.min(size, Math.max(range.from, range.to)))
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    let startIndex = $from.index(0)
    let endIndex = $to.depth > 0 ? $to.index(0) + 1 : $to.index(0)
    if (endIndex <= startIndex) endIndex = Math.min(doc.childCount, startIndex + 1)
    startIndex = Math.max(0, startIndex - context)
    endIndex = Math.min(doc.childCount, endIndex + context)
    if (startIndex >= endIndex) continue
    widened.push({ from: $from.posAtIndex(startIndex, 0), to: $to.posAtIndex(endIndex, 0) })
  }
  widened.sort((a, b) => a.from - b.from)
  const merged: Range[] = []
  for (const range of widened) {
    const last = merged[merged.length - 1]
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to)
    else merged.push({ ...range })
  }
  return merged
}

/** Top-level block ranges every transaction in a batch changed, in the final document. */
export function changedBlocks(transactions: readonly Transaction[], doc: ProseMirrorNode, context = 0): Range[] {
  const ranges: Range[] = []
  transactions.forEach((tr, index) => {
    if (!tr.docChanged) return
    let own = changedRanges(tr)
    // Later transactions of the batch move these ranges on.
    for (const later of transactions.slice(index + 1)) {
      own = own.map((range) => ({ from: later.mapping.map(range.from, -1), to: later.mapping.map(range.to, 1) }))
    }
    ranges.push(...own)
  })
  return topLevelRanges(doc, ranges, context)
}

/**
 * Bring a decoration set up to date with a transaction: decorations move with the edit, and those
 * inside the changed blocks are built again by `decorate(doc, from, to)`.
 */
export function updateDecorations(
  tr: Transaction,
  previous: DecorationSet,
  decorate: (doc: ProseMirrorNode, from: number, to: number) => Decoration[],
  context = 0,
): DecorationSet {
  let set = previous.map(tr.mapping, tr.doc)
  for (const { from, to } of topLevelRanges(tr.doc, changedRanges(tr), context)) {
    const stale = set.find(from, to).filter((decoration) => decoration.from >= from && decoration.to <= to)
    set = set.remove(stale).add(tr.doc, decorate(tr.doc, from, to))
  }
  return set
}
