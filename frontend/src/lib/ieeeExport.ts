/**
 * IEEE paper export to a real Word (.docx) file.
 *
 * Layout follows the IEEE conference template: US Letter, margins top 0.75in /
 * bottom 1in / left and right 0.625in, Times New Roman 10pt. The title, author
 * block, Abstract and Index Terms sit in a full-width first section; everything
 * after them flows in a continuous two-column section (0.25in gap, justified).
 * Heading numbers are the literal text already in the document.
 */
import type {
  IParagraphOptions,
  ISectionOptions,
  ParagraphChild,
  Paragraph as DocxParagraph,
  Table as DocxTable,
} from 'docx'

import { latexToMath } from './latexToMath'
import { groupBySpan } from '@/components/editor/ieeeSpan'

type Docx = typeof import('docx')
type Block = DocxParagraph | DocxTable

const FONT = 'Times New Roman'
const TWIPS_PER_INCH = 1440
const PAGE = { width: 12240, height: 15840 }
const MARGINS = { top: 1080, bottom: 1440, left: 900, right: 900 }
const COLUMN_GAP = 360
/** Width of one text column in twips: the page between its margins, less the gap, split in two. */
const COLUMN_WIDTH = (PAGE.width - MARGINS.left - MARGINS.right - COLUMN_GAP) / 2
/** Widest an image may be inside one column (3.5in) in CSS pixels. */
const COLUMN_IMAGE_PX = 336

interface RunStyle {
  bold?: boolean
  italics?: boolean
  underline?: Record<string, never>
  superScript?: boolean
  subScript?: boolean
  smallCaps?: boolean
  size?: number
}

/** Collapses whitespace the way HTML rendering does. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** Decodes a data: URL into bytes and its image type, or null if unsupported. */
function decodeDataImage(src: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' } | null {
  const match = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(src)
  if (!match) return null
  const raw = atob(match[2])
  const data = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) data[i] = raw.charCodeAt(i)
  const kind = match[1].toLowerCase()
  return { data, type: kind === 'png' ? 'png' : kind === 'gif' ? 'gif' : 'jpg' }
}

/**
 * An equation as a Word equation, or its LaTeX source as visible italic text when it uses something
 * the mapper does not cover (accents, matrices, aligned blocks), so no equation is ever left out.
 */
function equationChild(D: Docx, latex: string, style: RunStyle): ParagraphChild {
  const parts = latexToMath(D, latex)
  return parts ? new D.Math({ children: parts }) : new D.TextRun({ text: latex, font: FONT, ...style, italics: true })
}

/** A display equation: centred between the column edges, its number (if any) at the right edge. */
function equationBlock(D: Docx, el: HTMLElement): DocxParagraph {
  const number = el.getAttribute('data-number')
  const equation = equationChild(D, el.getAttribute('data-latex') ?? '', {})
  if (!number) return new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [equation] })
  return new D.Paragraph({
    tabStops: [
      { type: D.TabStopType.CENTER, position: COLUMN_WIDTH / 2 },
      { type: D.TabStopType.RIGHT, position: COLUMN_WIDTH },
    ],
    spacing: { before: 60, after: 60 },
    children: [
      new D.TextRun({ children: [new D.Tab()], font: FONT }),
      equation,
      new D.TextRun({ children: [new D.Tab(), `(${number})`], font: FONT }),
    ],
  })
}

/** Walks an element's inline content and returns Word runs/images carrying the inherited style. */
function inlineChildren(D: Docx, node: Node, style: RunStyle): ParagraphChild[] {
  const out: ParagraphChild[] = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = collapse(child.textContent ?? '')
      if (text) out.push(new D.TextRun({ text, font: FONT, ...style }))
      return
    }
    if (!(child instanceof HTMLElement)) return
    const tag = child.tagName.toLowerCase()
    if (tag === 'br') {
      out.push(new D.TextRun({ break: 1, font: FONT, ...style }))
    } else if (child.getAttribute('data-type') === 'inline-math') {
      out.push(equationChild(D, child.getAttribute('data-latex') ?? '', style))
    } else if (tag === 'img') {
      const image = decodeDataImage(child.getAttribute('src') ?? '')
      if (!image) return
      const w = Math.min(Number(child.getAttribute('width')) || COLUMN_IMAGE_PX, COLUMN_IMAGE_PX)
      const ratio = Number(child.getAttribute('height')) / (Number(child.getAttribute('width')) || 1)
      const h = Math.round(w * (ratio > 0 ? ratio : 0.66))
      out.push(new D.ImageRun({ data: image.data, type: image.type, transformation: { width: w, height: h } }))
    } else {
      const next: RunStyle = { ...style }
      if (tag === 'strong' || tag === 'b') next.bold = true
      if (tag === 'em' || tag === 'i') next.italics = true
      if (tag === 'u') next.underline = {}
      if (tag === 'sup') next.superScript = true
      if (tag === 'sub') next.subScript = true
      out.push(...inlineChildren(D, child, next))
    }
  })
  return out
}

/** Builds a paragraph from an element's inline content with the given options. */
function paragraphFrom(D: Docx, el: Element, style: RunStyle, options: IParagraphOptions): DocxParagraph {
  return new D.Paragraph({ ...options, children: inlineChildren(D, el, style) })
}

/** Converts a list element into hanging-indent paragraphs with literal markers. */
function listBlocks(D: Docx, list: HTMLElement, size: number): Block[] {
  const ordered = list.tagName.toLowerCase() === 'ol'
  const out: Block[] = []
  Array.from(list.children).forEach((item, index) => {
    const marker = ordered ? `${index + 1}.` : '•'
    const children: ParagraphChild[] = [new D.TextRun({ text: `${marker}\t`, font: FONT, size })]
    children.push(...inlineChildren(D, item, { size }))
    out.push(
      new D.Paragraph({
        alignment: D.AlignmentType.JUSTIFIED,
        indent: { left: 360, hanging: 360 },
        tabStops: [{ type: D.TabStopType.LEFT, position: 360 }],
        children,
      })
    )
  })
  return out
}

/** Converts an HTML table into a bordered Word table with 8pt cell text. */
function tableBlock(D: Docx, table: HTMLElement): DocxTable {
  const rows = Array.from(table.querySelectorAll('tr')).map(
    (tr) =>
      new D.TableRow({
        children: Array.from(tr.children).map(
          (cell) =>
            new D.TableCell({
              children: [
                new D.Paragraph({ children: inlineChildren(D, cell, { size: 16, bold: cell.tagName === 'TH' }) }),
              ],
            })
        ),
      })
  )
  return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } })
}

/** Plain text of an element, whitespace-normalised. */
function textOf(el: Element): string {
  return collapse(el.textContent ?? '').trim()
}

/** True for the Abstract / Index Terms run-in paragraphs (with or without the em dash label). */
function isFrontLabel(text: string): boolean {
  return /^(abstract|index terms|keywords?)\s*[—–:-]/i.test(text)
}

/** Builds the body blocks for one non-front-matter element. */
function bodyBlocks(D: Docx, el: HTMLElement, inReferences: { value: boolean }): Block[] {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const isRefs = level === 1 && /^references$/i.test(textOf(el))
    inReferences.value = isRefs || (inReferences.value && level > 1)
    if (level === 1) {
      return [
        paragraphFrom(D, el, { smallCaps: true, size: 20 }, {
          alignment: D.AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 120, after: 120 },
        }),
      ]
    }
    return [
      paragraphFrom(D, el, { italics: true }, {
        alignment: D.AlignmentType.LEFT,
        keepNext: true,
        spacing: { before: 60, after: 60 },
      }),
    ]
  }
  if (tag === 'ul' || tag === 'ol') return listBlocks(D, el, inReferences.value ? 18 : 20)
  if (tag === 'table') return [tableBlock(D, el)]
  if (tag === 'div' && el.getAttribute('data-type') === 'block-math') return [equationBlock(D, el)]
  if (tag === 'p' || tag === 'blockquote' || tag === 'div') {
    if (el.getAttribute('data-caption-kind')) {
      return [paragraphFrom(D, el, { size: 18 }, { alignment: D.AlignmentType.CENTER, spacing: { after: 120 } })]
    }
    if (inReferences.value) {
      return [
        paragraphFrom(D, el, { size: 18 }, {
          alignment: D.AlignmentType.JUSTIFIED,
          indent: { left: 360, hanging: 360 },
          spacing: { after: 40 },
        }),
      ]
    }
    if (!textOf(el) && !el.querySelector('img')) return [new D.Paragraph({})]
    return [
      paragraphFrom(D, el, {}, {
        alignment: el.querySelector('img') ? D.AlignmentType.CENTER : D.AlignmentType.JUSTIFIED,
        indent: { firstLine: 202 },
        spacing: { after: 60 },
      }),
    ]
  }
  return []
}

/** Builds the full-width front matter: title, author lines, Abstract, Index Terms. */
function frontBlocks(D: Docx, titleEl: HTMLElement | null, authorEls: HTMLElement[], labelEls: HTMLElement[], fallbackTitle: string): Block[] {
  const out: Block[] = []
  const title = titleEl
    ? paragraphFrom(D, titleEl, { size: 48 }, { alignment: D.AlignmentType.CENTER, spacing: { after: 240 } })
    : new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new D.TextRun({ text: fallbackTitle, font: FONT, size: 48 })],
      })
  out.push(title)
  authorEls.forEach((el) =>
    out.push(paragraphFrom(D, el, { size: 20 }, { alignment: D.AlignmentType.CENTER, spacing: { after: 40 } }))
  )
  labelEls.forEach((el) =>
    out.push(
      paragraphFrom(D, el, { bold: true, size: 18 }, {
        alignment: D.AlignmentType.JUSTIFIED,
        spacing: { before: 120, after: 60 },
        indent: { firstLine: 202 },
      })
    )
  )
  return out
}

/** How a section lays out its page: the full-width front matter, the two-column body, or a full-width run inside it. */
type SectionLayout = 'front' | 'columns' | 'full'

/** Page setup shared by every section; only the type and column count differ. */
function pageProperties(D: Docx, layout: SectionLayout): ISectionOptions['properties'] {
  return {
    type: layout === 'front' ? undefined : D.SectionType.CONTINUOUS,
    page: {
      size: { width: PAGE.width, height: PAGE.height },
      margin: { ...MARGINS, header: TWIPS_PER_INCH / 2, footer: TWIPS_PER_INCH / 2 },
    },
    column: layout === 'columns' ? { count: 2, space: COLUMN_GAP, equalWidth: true } : undefined,
  }
}

/** Builds the IEEE .docx file as a Blob from editor HTML. */
export async function buildIeeeDocxBlob(html: string, title: string): Promise<Blob> {
  const D = await import('docx')
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const elements = Array.from(body.children) as HTMLElement[]

  const titleIndex = elements.findIndex((el) => el.getAttribute('data-doc-role') === 'title')
  const titleEl = titleIndex >= 0 ? elements[titleIndex] : null
  const rest = elements.filter((_, i) => i !== titleIndex)

  // Front matter = leading non-heading paragraphs (author lines, then the
  // Abstract / Index Terms run-ins), up to the first heading.
  const authorEls: HTMLElement[] = []
  const labelEls: HTMLElement[] = []
  let cursor = 0
  while (cursor < rest.length && rest[cursor].tagName.toLowerCase() === 'p') {
    const el = rest[cursor]
    if (isFrontLabel(textOf(el))) labelEls.push(el)
    else if (labelEls.length === 0) authorEls.push(el)
    else break
    cursor += 1
  }

  // The body runs in two columns; a table, figure or equation marked full width (with its caption) is a
  // single-column run of its own between two-column runs, as in an IEEE paper.
  const references = { value: false }
  const bodySections: ISectionOptions[] = groupBySpan(rest.slice(cursor) as HTMLElement[])
    .map((group) => ({
      properties: pageProperties(D, group.full ? 'full' : 'columns'),
      children: (group.elements as HTMLElement[]).flatMap((el) => bodyBlocks(D, el, references)),
    }))
    .filter((section) => section.children.length > 0)
  if (bodySections.length === 0) bodySections.push({ properties: pageProperties(D, 'columns'), children: [new D.Paragraph({})] })

  const doc = new D.Document({
    title: title.trim() || 'Untitled Document',
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
    },
    sections: [
      { properties: pageProperties(D, 'front'), children: frontBlocks(D, titleEl, authorEls, labelEls, title.trim() || 'Untitled Document') },
      ...bodySections,
    ],
  })
  return D.Packer.toBlob(doc)
}

/** One-click IEEE Word export: builds the .docx and triggers a download. */
export async function exportIeeeDocx(html: string, title: string): Promise<void> {
  const blob = await buildIeeeDocxBlob(html, title)
  const fileTitle = (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileTitle} (IEEE).docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
