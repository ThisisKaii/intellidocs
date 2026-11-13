import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { FRONT_LABEL, createFrontMatterTracker } from './frontMatter'

/**
 * Extra blank lines: runs of empty paragraphs (Enter pressed on an empty line) longer than the
 * document usually leaves in the same kind of gap.
 *
 * Gaps are judged by what they sit between (body text, a sub-heading, …), against the run length
 * most such gaps in this document use, so a document that always leaves one blank line between
 * paragraphs is judged by that, not by a fixed rule. Deliberate layout is never flagged: the
 * title page and approval sheet, the gap before a chapter heading or front-matter label, before
 * a page break, and blank lines that push the next block onto a new page (the end of a chapter).
 */

export type GapKind = 'body>body' | 'heading>body' | 'body>heading'

export interface BlankRun {
  /** Start of the first extra empty paragraph; with `to`, exactly the lines to remove. */
  from: number
  to: number
  /** Blank lines to remove, the run's length and the usual length for this gap. */
  extra: number
  length: number
  usual: number
  kind: GapKind
  /** The text after the gap, to name the place. */
  nextText: string
  /** Document range of the whole gap: end of the block before to start of the block after. */
  gapFrom: number
  gapTo: number
}

/** Answers whether the block after a gap starts on a later page than the block before it. */
export type CrossesPage = (gap: { prevEnd: number; nextStart: number; blankLines: number }) => boolean

/** Share of gaps of a kind one length must cover to be the usual one, and the fewest gaps that settle it. */
const MIN_SHARE = 0.6
const MIN_GAPS = 5
/** Body text: a paragraph long enough to be prose. */
const BODY_MIN_CHARS = 40
const CAPTION = /^(figure|fig\.|table)\s+\d+/i
const CHAPTER = /^chapter\b/i

/** A paragraph with no visible text and nothing but line breaks inside. */
export function isBlankParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph' || node.textContent.trim().length > 0) return false
  let onlyBreaks = true
  node.forEach((child) => {
    if (!child.isText && child.type.name !== 'hardBreak') onlyBreaks = false
  })
  return onlyBreaks
}

type BlockKind = 'body' | 'heading' | 'start_of_section' | 'other'

function kindOf(node: ProseMirrorNode): BlockKind {
  const text = node.textContent.replace(/\s+/g, ' ').trim()
  if (node.type.name === 'pageBreak') return 'start_of_section'
  if (node.type.name === 'heading') {
    if (Number(node.attrs.level) === 1 || node.attrs.docRole === 'title' || CHAPTER.test(text)) return 'start_of_section'
    return 'heading'
  }
  if (node.type.name !== 'paragraph') return 'other'
  if (FRONT_LABEL.test(text.replace(/[:.]$/, '')) || CHAPTER.test(text)) return 'start_of_section'
  if (text.length >= BODY_MIN_CHARS && !CAPTION.test(text)) return 'body'
  return 'other'
}

function gapKind(prev: BlockKind, next: BlockKind): GapKind | null {
  if (prev === 'body' && next === 'body') return 'body>body'
  if (prev === 'heading' && next === 'body') return 'heading>body'
  if (prev === 'body' && next === 'heading') return 'body>heading'
  return null
}

/** Find blank-line runs longer than the document's usual for their kind of gap. */
export function findExtraBlankLines(doc: ProseMirrorNode, crossesPage: CrossesPage = () => false): BlankRun[] {
  interface Gap {
    kind: GapKind
    length: number
    blanks: Array<{ pos: number; size: number }>
    prevEnd: number
    nextStart: number
    nextText: string
    exempt: boolean
  }
  const gaps: Gap[] = []
  const regionOf = createFrontMatterTracker()
  let prev: { kind: BlockKind; end: number; frontMatter: boolean } | null = null
  let blanks: Array<{ pos: number; size: number }> = []

  doc.forEach((node, pos) => {
    if (isBlankParagraph(node)) {
      blanks.push({ pos, size: node.nodeSize })
      return
    }
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    const isHeading = node.type.name === 'heading' && node.attrs.docRole !== 'title'
    const frontMatter = node.isTextblock && text.length > 0 ? regionOf(text, isHeading) !== null : false
    const kind = kindOf(node)
    if (prev) {
      const gk = gapKind(prev.kind, kind)
      if (gk) {
        const exempt =
          prev.frontMatter ||
          frontMatter ||
          (blanks.length > 0 && crossesPage({ prevEnd: prev.end, nextStart: pos, blankLines: blanks.length }))
        gaps.push({ kind: gk, length: blanks.length, blanks, prevEnd: prev.end, nextStart: pos, nextText: text, exempt })
      }
    }
    prev = { kind, end: pos + node.nodeSize, frontMatter }
    blanks = []
  })

  const runs: BlankRun[] = []
  for (const kind of ['body>body', 'heading>body', 'body>heading'] as const) {
    const ofKind = gaps.filter((gap) => gap.kind === kind && !gap.exempt)
    if (ofKind.length < MIN_GAPS) continue
    const counts = new Map<number, number>()
    for (const gap of ofKind) counts.set(gap.length, (counts.get(gap.length) ?? 0) + 1)
    const [usual, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    if (count / ofKind.length < MIN_SHARE) continue
    for (const gap of ofKind) {
      if (gap.length <= usual) continue
      const extra = gap.length - usual
      // The extra lines are the first ones of the run; the usual count stays next to the text after.
      const removed = gap.blanks.slice(0, extra)
      const last = removed[removed.length - 1]
      runs.push({
        from: removed[0].pos,
        to: last.pos + last.size,
        extra,
        length: gap.length,
        usual,
        kind,
        nextText: gap.nextText,
        gapFrom: gap.prevEnd,
        gapTo: gap.nextStart,
      })
    }
  }
  return runs.sort((a, b) => a.from - b.from)
}
