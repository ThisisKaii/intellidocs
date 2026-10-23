import { Extension } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { STRUCTURAL_SECTION_PATTERN } from './TableOfContents'

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
  const label = kind === 'figure' ? /^Figure\s+\d+\s*[.:]/i : /^Table\s+\d+\s*[.:]/i
  const entries: PartEntry[] = []
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph' || node.attrs.generated) return
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text.length > 0 && text.length <= 200 && label.test(text)) entries.push({ text, level: 1, pos: offset + 1 })
  })
  return entries
}

/** One title paragraph plus one tab-aligned line per entry (page number right, dotted leader). */
function buildListNodes(editor: Editor, kind: GeneratedKind, entries: PartEntry[]): JSONContent[] {
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
      { type: 'text', text: String(pageNumberAt(editor, entry.pos)) },
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
    const text = (italic ? part.slice(3, -4) : part).replace(/<[^>]+>/g, '')
    if (text) nodes.push(italic ? { type: 'text', text, marks: [{ type: 'italic' }] } : { type: 'text', text })
  }
  return nodes
}

/** The References block: a title and one paragraph per formatted bibliography entry. */
export function buildReferenceNodes(entriesHtml: string[]): JSONContent[] {
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
  return [title, ...entries]
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

/** Build the nodes for a table of contents or a list of figures/tables from the live document. */
export function buildAutoNodes(editor: Editor, kind: 'toc' | 'lof' | 'lot'): JSONContent[] {
  const entries = kind === 'toc' ? collectSections(editor) : collectCaptions(editor, kind === 'lof' ? 'figure' : 'table')
  return buildListNodes(editor, kind, entries)
}

/**
 * Replace the existing generated block of this kind, or insert a new one below
 * the caret's top-level block. Returns true when an existing block was updated.
 */
export function insertOrUpdateGenerated(editor: Editor, kind: GeneratedKind, nodes: JSONContent[]): boolean {
  const existing = findGeneratedRange(editor, kind)
  if (existing) {
    editor.chain().focus().insertContentAt(existing, nodes).run()
    return true
  }
  const { $from } = editor.state.selection
  const at = $from.depth >= 1 ? $from.after(1) : editor.state.doc.content.size
  editor.chain().focus().insertContentAt(at, nodes).run()
  return false
}
