import { Extension } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { STRUCTURAL_SECTION_PATTERN } from './TableOfContents'
import { firstChapterPos, manuscriptPageLabel } from '@/lib/pageLayout'

/** The generated blocks a document can carry. */
export type GeneratedKind = 'toc' | 'lof' | 'lot' | 'refs'

export const GENERATED_TITLES: Record<GeneratedKind, string> = {
  toc: 'TABLE OF CONTENTS',
  lof: 'LIST OF FIGURES',
  lot: 'LIST OF TABLES',
  refs: 'REFERENCES',
}

interface PartEntry {
  text: string
  level: number
  pos: number
}

/**
 * Generated paragraphs (table of contents, lists of figures/tables, references)
 * carry `data-generated`, so a later "Update" can find and replace exactly them.
 */
export const GeneratedBlockExtension = Extension.create({
  name: 'generatedBlocks',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          generated: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-generated'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.generated ? { 'data-generated': String(attributes.generated) } : {},
          },
        },
      },
    ]
  },
})

/**
 * 1-based page a document position falls on. Each page starts at its header
 * zone, so the page is the number of non-empty header zones at or above the
 * position (the paginator's `.rm-page-break` markers have no height to use).
 */
export function pageNumberAt(editor: Editor, pos: number): number {
  const top = editor.view.coordsAtPos(pos).top
  let page = 0
  editor.view.dom.querySelectorAll<HTMLElement>('.rm-page-header').forEach((zone) => {
    const rect = zone.getBoundingClientRect()
    if (rect.height > 0 && rect.top <= top + 1) page += 1
  })
  return Math.max(1, page)
}

/**
 * A page lookup for many positions at once: the page header zones are measured once (pageNumberAt
 * measures them all for every position, which is slow for a long table of contents).
 */
export function pageFinder(editor: Editor): (pos: number) => number {
  const tops: number[] = []
  editor.view.dom.querySelectorAll<HTMLElement>('.rm-page-header').forEach((zone) => {
    const rect = zone.getBoundingClientRect()
    if (rect.height > 0) tops.push(rect.top)
  })
  tops.sort((a, b) => a - b)
  return (pos: number): number => {
    let top: number
    try {
      top = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size)).top
    } catch {
      return 1
    }
    let low = 0
    let high = tops.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (tops[middle] <= top + 1) low = middle + 1
      else high = middle
    }
    return Math.max(1, low)
  }
}

/** One heading or caption of a tab, with the page (within the tab) it is on. */
export interface OutlineItem {
  kind: 'heading' | 'figure' | 'table'
  level: number
  text: string
  page: number
}

/**
 * The headings and captions of the document in the editor, with their pages — what a tab of a
 * document split into tabs stores, so the table of contents and the lists of figures and tables can
 * be built across tabs without loading them. `pos` is kept for callers that split a whole body.
 */
export function documentOutline(editor: Editor): Array<OutlineItem & { pos: number }> {
  const pageOf = pageFinder(editor)
  const items: Array<OutlineItem & { pos: number }> = []
  for (const entry of collectSections(editor)) items.push({ kind: 'heading', level: entry.level, text: entry.text.slice(0, 400), page: pageOf(entry.pos), pos: entry.pos })
  for (const kind of ['figure', 'table'] as const) {
    for (const entry of collectCaptions(editor, kind)) items.push({ kind, level: 1, text: entry.text.slice(0, 400), page: pageOf(entry.pos), pos: entry.pos })
  }
  return items.sort((a, b) => a.pos - b.pos)
}

/** An entry from another tab for a generated list: its text, level and page as it should print. */
export interface ExternalListEntry {
  text: string
  level: number
  pageLabel: string
}

/** Entries from the tabs before and after the open one (a document split into tabs). */
export interface CrossTabEntries {
  before: ExternalListEntry[]
  after: ExternalListEntry[]
  /** How a page of the open tab prints (its numbering continues from the tabs before it). */
  pageLabel: (page: number) => string
}

/** Width in px of the text column, used for the right-aligned page-number tab stop. */
function textColumnWidth(editor: Editor): number {
  const dom = editor.view.dom as HTMLElement
  const style = getComputedStyle(dom)
  const width = dom.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
  return width > 200 ? Math.round(width) : 600
}

/** True when a paragraph begins with bold text. */
function startsBold(node: ProseMirrorNode): boolean {
  const first = node.firstChild
  return Boolean(first && first.marks.some((mark) => mark.type.name === 'bold'))
}

/** Headings (levels 1-3) and bold all-caps section titles, in document order. */
function collectSections(editor: Editor): PartEntry[] {
  const entries: PartEntry[] = []
  editor.state.doc.forEach((node, offset) => {
    if (node.attrs.generated) return
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text) return
    if (node.type.name === 'heading' && node.attrs.level <= 3 && node.attrs.docRole !== 'title') {
      entries.push({ text, level: node.attrs.level, pos: offset + 1 })
    } else if (node.type.name === 'paragraph' && text.length <= 80 && startsBold(node) && STRUCTURAL_SECTION_PATTERN.test(text)) {
      entries.push({ text, level: 1, pos: offset + 1 })
    }
  })
  return entries
}

/** Caption paragraphs ("Figure 2. …" / "Table 1: …"), marked or typed by hand. */
function collectCaptions(editor: Editor, kind: 'figure' | 'table'): PartEntry[] {
  const label = kind === 'figure' ? /^(?:Figure|Fig\.)\s+\d+\s*[.:]/i : /^Table\s+(?:\d+|[IVXLCDM]+)\s*[.:]/i
  const entries: PartEntry[] = []
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph' || node.attrs.generated) return
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text.length > 0 && text.length <= 200 && label.test(text)) entries.push({ text, level: 1, pos: offset + 1 })
  })
  return entries
}

/** One title paragraph plus one tab-aligned line per entry (page number right, dotted leader). */
function buildListNodes(editor: Editor, kind: GeneratedKind, entries: Array<{ text: string; level: number; pageLabel: string }>): JSONContent[] {
  const stops = JSON.stringify([['right', textColumnWidth(editor), 'dot']])
  const title: JSONContent = {
    type: 'paragraph',
    attrs: { generated: kind, textAlign: 'center' },
    content: [{ type: 'text', text: GENERATED_TITLES[kind], marks: [{ type: 'bold' }] }],
  }
  if (entries.length === 0) {
    return [
      title,
      { type: 'paragraph', attrs: { generated: kind }, content: [{ type: 'text', text: kind === 'toc' ? 'No headings yet.' : 'Nothing to list yet.' }] },
    ]
  }
  const lines = entries.map((entry): JSONContent => ({
    type: 'paragraph',
    attrs: { generated: kind, tabStops: stops },
    content: [
      { type: 'text', text: `${' '.repeat((entry.level - 1) * 4)}${entry.text}` },
      { type: 'tab' },
      { type: 'text', text: entry.pageLabel },
    ],
  }))
  return [title, ...lines]
}

/** Inline HTML with <i> tags to text nodes with italic marks. */
function italicTextNodes(html: string): JSONContent[] {
  const nodes: JSONContent[] = []
  for (const part of html.split(/(<i>.*?<\/i>)/g)) {
    if (!part) continue
    const italic = part.startsWith('<i>')
    const text = (italic ? part.slice(3, -4) : part)
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    if (text) nodes.push(italic ? { type: 'text', text, marks: [{ type: 'italic' }] } : { type: 'text', text })
  }
  return nodes
}

/** The References block: an optional title and one paragraph per formatted bibliography entry. */
export function buildReferenceNodes(entriesHtml: string[], withTitle: boolean = true): JSONContent[] {
  const title: JSONContent = {
    type: 'paragraph',
    attrs: { generated: 'refs', textAlign: 'center' },
    content: [{ type: 'text', text: GENERATED_TITLES.refs, marks: [{ type: 'bold' }] }],
  }
  const entries = entriesHtml.map((html): JSONContent => ({
    type: 'paragraph',
    attrs: { generated: 'refs' },
    content: italicTextNodes(html),
  }))
  return withTitle ? [title, ...entries] : entries
}

/** Placeholder text the IEEE blueprint puts under its References heading. */
const REFERENCES_PLACEHOLDER = 'IEEE numbered style, in order of citation.'

/**
 * Position just after an existing "References" heading, replacing the blueprint's
 * placeholder paragraph under it, or null when the document has no such heading.
 * Used so a generated bibliography fills the heading the document already has
 * instead of adding a second "REFERENCES" title.
 */
export function referencesHeadingEnd(editor: Editor): { at: number; placeholder: { from: number; to: number } | null } | null {
  let result: { at: number; placeholder: { from: number; to: number } | null } | null = null
  const doc = editor.state.doc
  doc.forEach((node, offset) => {
    if (result || node.type.name !== 'heading' || !/^references:?$/i.test(node.textContent.trim().replace(/^[ivxlcdm]+\.\s+/i, ''))) return
    const at = offset + node.nodeSize
    const next = doc.nodeAt(at)
    const placeholder = next && next.textContent.trim() === REFERENCES_PLACEHOLDER ? { from: at, to: at + next.nodeSize } : null
    result = { at, placeholder }
  })
  return result
}

/** Blueprint text under an empty front-matter heading ("Generate this from Tools, Document parts, …"). */
const PART_PLACEHOLDER = /^Generate this from Tools/i

/**
 * The document's own heading for a generated part ("TABLE OF CONTENTS", "LIST OF FIGURES",
 * "LIST OF TABLES"): where it ends, and the placeholder paragraph under it if there is one.
 */
function partHeading(editor: Editor, kind: GeneratedKind): { end: number; placeholder: { from: number; to: number } | null } | null {
  const want = GENERATED_TITLES[kind].toLowerCase()
  let result: { end: number; placeholder: { from: number; to: number } | null } | null = null
  const doc = editor.state.doc
  doc.forEach((node, offset) => {
    if (result || node.type.name !== 'heading' || node.attrs.generated) return
    if (node.textContent.trim().toLowerCase() !== want) return
    const end = offset + node.nodeSize
    const next = doc.nodeAt(end)
    const placeholder = next && next.type.name === 'paragraph' && PART_PLACEHOLDER.test(next.textContent.trim())
      ? { from: end, to: end + next.nodeSize }
      : null
    result = { end, placeholder }
  })
  return result
}

/** First top-level run of paragraphs tagged with `kind`, as a document range. */
function findGeneratedRange(editor: Editor, kind: GeneratedKind): { from: number; to: number } | null {
  let from = -1
  let to = -1
  editor.state.doc.forEach((node, offset) => {
    if (node.attrs.generated !== kind) return
    if (from < 0) {
      from = offset
      to = offset + node.nodeSize
    } else if (offset === to) {
      to = offset + node.nodeSize
    }
  })
  return from >= 0 ? { from, to } : null
}

/**
 * Build the nodes for a table of contents or a list of figures/tables from the live document. In a
 * document split into tabs, `crossTab` brings the other tabs' entries (from their stored outlines)
 * and prints the open tab's pages with its continued numbering.
 */
export function buildAutoNodes(editor: Editor, kind: 'toc' | 'lof' | 'lot', crossTab: CrossTabEntries | null = null): JSONContent[] {
  const entries = kind === 'toc' ? collectSections(editor) : collectCaptions(editor, kind === 'lof' ? 'figure' : 'table')
  const pageOf = pageFinder(editor)
  let label = crossTab?.pageLabel ?? ((page: number) => String(page))
  if (!crossTab && (editor.view.dom as HTMLElement).dataset.pageNumbers === 'manuscript') {
    // The pages show i, ii, iii on the front matter and 1, 2, 3 from Chapter I: list those numbers.
    const chapterPos = firstChapterPos(editor.state.doc)
    const chapterPage = chapterPos === null ? null : pageOf(chapterPos)
    label = (page: number) => manuscriptPageLabel(page, chapterPage)
  }
  const own = entries.map((entry) => ({ text: entry.text, level: entry.level, pageLabel: label(pageOf(entry.pos)) }))
  return buildListNodes(editor, kind, crossTab ? [...crossTab.before, ...own, ...crossTab.after] : own)
}

/**
 * Replace the existing generated block of this kind, fill the document's own heading for it, or
 * insert a new one below the caret's top-level block. Says which of the three it did.
 */
export function insertOrUpdateGenerated(editor: Editor, kind: GeneratedKind, nodes: JSONContent[]): 'updated' | 'heading' | 'cursor' {
  const existing = findGeneratedRange(editor, kind)
  const heading = kind === 'refs' ? null : partHeading(editor, kind)
  // Under the document's own "TABLE OF CONTENTS" / "LIST OF FIGURES" heading the list needs no title of its own.
  const entries = heading && nodes[0]?.attrs?.textAlign === 'center' ? nodes.slice(1) : nodes
  if (existing) {
    editor.chain().focus().insertContentAt(existing, heading && existing.from === heading.end ? entries : nodes).run()
    return 'updated'
  }
  if (heading) {
    // Fill the heading the document already has (a blueprint's front matter), replacing its
    // "Generate this from Tools …" placeholder, instead of adding a second list at the caret.
    editor.chain().focus().insertContentAt(heading.placeholder ?? heading.end, entries).run()
    return 'heading'
  }
  const { $from } = editor.state.selection
  const at = $from.depth >= 1 ? $from.after(1) : editor.state.doc.content.size
  editor.chain().focus().insertContentAt(at, nodes).run()
  return 'cursor'
}
