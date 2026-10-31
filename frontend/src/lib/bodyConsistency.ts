import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** The look of one body paragraph, read over all of its text rather than only its first word. */
export interface BodyStyle {
  bold: boolean
  italic: boolean
  fontSize: number | null
  textAlign: string
}

/** A body paragraph whose look departs from what most of the document's body text shares. */
export interface BodyDeviation {
  pos: number
  node: ProseMirrorNode
  text: string
  style: BodyStyle
  modal: BodyStyle
  /** Which of the four properties differ, in plain words. */
  differences: string[]
}

/** Shorter lines are title-page text, captions or labels, which are styled on purpose. */
const MIN_PROSE_CHARS = 80
/** Fewer paragraphs than this give no reliable "usual" look. */
const MIN_PROSE_BLOCKS = 8
/** The usual look must cover at least this share of the body text. */
const MIN_MODAL_SHARE = 0.8

/** The first line of the body proper. */
const BODY_START = /^(chapter\s+(1|one|i)|1\.?\s+introduction|introduction|abstract)\s*[:.]?$/i

/** Containers whose paragraphs are not running body text. */
const SKIPPED_ANCESTORS = new Set([
  'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader',
  'blockquote', 'codeBlock', 'columnSection',
])

/** The look of a paragraph: bold or italic only when every character carries it. */
export function bodyStyleOf(node: ProseMirrorNode): BodyStyle {
  let bold = true
  let italic = true
  let fontSize: number | null = null
  let sawText = false
  node.forEach((child) => {
    if (!child.isText || !child.text?.trim()) return
    bold &&= child.marks.some((mark) => mark.type.name === 'bold')
    italic &&= child.marks.some((mark) => mark.type.name === 'italic')
    if (!sawText) {
      const raw = child.marks.find((mark) => mark.type.name === 'textStyle')?.attrs?.fontSize
      const parsed = typeof raw === 'string' ? parseFloat(raw) : NaN
      fontSize = Number.isNaN(parsed) ? null : parsed
    }
    sawText = true
  })
  const align = typeof node.attrs.textAlign === 'string' && node.attrs.textAlign ? node.attrs.textAlign : 'left'
  return { bold: sawText && bold, italic: sawText && italic, fontSize, textAlign: align }
}

/** Comparison key for a body style. */
function bodyStyleKey(style: BodyStyle): string {
  return `${style.bold}|${style.italic}|${style.fontSize ?? 'x'}|${style.textAlign}`
}

/** The size inherited text renders at in the editor, and how far an explicit size must stray from it to count. */
const INHERITED_PT = 11
const INHERITED_TOLERANCE_PT = 2

/** Whether two sizes read as different; an explicit size close to the inherited one is the same look. */
function sizesDiffer(modal: number | null, style: number | null): boolean {
  if (modal === style) return false
  if (modal !== null && style !== null) return true
  const explicit = modal ?? style
  return explicit !== null && Math.abs(explicit - INHERITED_PT) >= INHERITED_TOLERANCE_PT
}

/** Plain-language differences between a deviating paragraph and the usual look. */
function describeDifferences(modal: BodyStyle, style: BodyStyle): string[] {
  const out: string[] = []
  if (sizesDiffer(modal.fontSize, style.fontSize)) {
    out.push(style.fontSize !== null && modal.fontSize !== null ? `${style.fontSize}pt instead of ${modal.fontSize}pt` : 'a different size')
  }
  if (modal.bold !== style.bold) out.push(style.bold ? 'bold' : 'not bold')
  if (modal.italic !== style.italic) out.push(style.italic ? 'italic' : 'not italic')
  if (modal.textAlign !== style.textAlign) out.push(`${style.textAlign}-aligned instead of ${modal.textAlign}`)
  return out
}

/**
 * Body paragraphs that look different from the rest of the body text. A paragraph is only
 * flagged when most prose shares one look, so a document that is mixed throughout is left alone.
 */
export function findBodyDeviations(doc: ProseMirrorNode): { deviations: BodyDeviation[]; modal: BodyStyle | null } {
  const members: Array<{ pos: number; node: ProseMirrorNode; text: string; style: BodyStyle }> = []
  // Cover pages, approval sheets and tables of contents are styled by hand; the body starts at the first chapter.
  let markerSeen = false
  doc.descendants((node, pos) => {
    if (SKIPPED_ANCESTORS.has(node.type.name)) return false
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!markerSeen && BODY_START.test(text)) {
      markerSeen = true
      members.length = 0
    }
    if (node.type.name !== 'paragraph') return false
    if (text.length >= MIN_PROSE_CHARS && !/^(table|figure)\s+\d+\s*[:.]/i.test(text) && !/^\[\d+\]/.test(text)) {
      members.push({ pos, node, text, style: bodyStyleOf(node) })
    }
    return false
  })
  if (members.length < MIN_PROSE_BLOCKS) return { deviations: [], modal: null }

  const counts = new Map<string, number>()
  for (const member of members) {
    const key = bodyStyleKey(member.style)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let modalKey = ''
  let modalCount = 0
  for (const [key, count] of counts) {
    if (count > modalCount) {
      modalKey = key
      modalCount = count
    }
  }
  if (modalCount === members.length || modalCount / members.length < MIN_MODAL_SHARE) return { deviations: [], modal: null }

  const modal = members.find((member) => bodyStyleKey(member.style) === modalKey)!.style
  const deviations: BodyDeviation[] = []
  for (const member of members) {
    if (bodyStyleKey(member.style) === modalKey) continue
    const differences = describeDifferences(modal, member.style)
    if (differences.length === 0) continue
    deviations.push({ ...member, modal, differences })
  }
  return { deviations, modal }
}
