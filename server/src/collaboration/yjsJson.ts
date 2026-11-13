import * as Y from 'yjs'

/** The Y.XmlFragment TipTap's Collaboration extension binds to (its `field` option, default "default"). */
export const COLLAB_FIELD = 'default'

/** A ProseMirror node as saved by the editor's `getJSON()` (documents.content_json). */
export interface PmJsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PmJsonNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

/** True for a JSON value shaped like a ProseMirror document. */
export function isPmDoc(value: unknown): value is PmJsonNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc' &&
    (Array.isArray((value as { content?: unknown }).content) || (value as { content?: unknown }).content === undefined)
  )
}

/** Mark list → Y.XmlText format attributes, the encoding y-tiptap reads back as marks. */
function marksToAttributes(marks: PmJsonNode['marks']): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  for (const mark of marks ?? []) attributes[mark.type] = mark.attrs ?? {}
  return attributes
}

/** One run of adjacent text nodes → a single Y.XmlText, as y-tiptap groups them. */
function textRunToY(run: PmJsonNode[]): Y.XmlText {
  const text = new Y.XmlText()
  text.applyDelta(run.map((node) => ({ insert: node.text ?? '', attributes: marksToAttributes(node.marks) })))
  return text
}

/** Children of a node, with adjacent text nodes grouped into runs. */
function childrenToY(content: PmJsonNode[] | undefined): Array<Y.XmlElement | Y.XmlText> {
  const out: Array<Y.XmlElement | Y.XmlText> = []
  let run: PmJsonNode[] = []
  for (const child of content ?? []) {
    if (child.type === 'text') {
      run.push(child)
      continue
    }
    if (run.length) out.push(textRunToY(run))
    run = []
    out.push(elementToY(child))
  }
  if (run.length) out.push(textRunToY(run))
  return out
}

/** An element node → Y.XmlElement named after its type; null attributes are left out, as y-tiptap does. */
function elementToY(node: PmJsonNode): Y.XmlElement {
  const element = new Y.XmlElement(node.type)
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    // Y.XmlElement attributes accept any JSON value at runtime; its typings only say string.
    if (value !== null && value !== undefined) element.setAttribute(key, value as string)
  }
  element.insert(0, childrenToY(node.content))
  return element
}

/** Largest rowspan among a row's cells (tiptap-table-plus `getMaximumRowSpan`). */
function maxRowSpan(row: PmJsonNode): number {
  let max = 0
  for (const cell of row.content ?? []) {
    const span = typeof cell.attrs?.rowspan === 'number' && cell.attrs.rowspan > 0 ? cell.attrs.rowspan : 1
    if (span > max) max = span
  }
  return max
}

/** Row numbers (1-based) grouped so a cell spanning rows keeps them together (table-plus logic). */
function rowGroups(rows: PmJsonNode[]): number[][] {
  const groups: number[][] = []
  for (let i = 1; i <= rows.length; i++) {
    const span = maxRowSpan(rows[i - 1]) || 1
    const group: number[] = []
    for (let j = 0; j < span && i + j <= rows.length; j++) group.push(i + j)
    groups.push(group)
  }
  // Merge overlapping groups until none overlap; rows are contiguous, so ranges suffice.
  const merged: Array<[number, number]> = []
  for (const group of groups) {
    const lo = Math.min(...group)
    const hi = Math.max(...group)
    const last = merged[merged.length - 1]
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi)
    else merged.push([lo, hi])
  }
  return merged.map(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k))
}

/**
 * Lay out a table's rows the way tiptap-table-plus's row-group plugin does: rows wrapped in
 * `tableRowGroup` only when some cell spans rows, otherwise directly under the table. A document
 * loaded from HTML keeps its `<tbody>` group until the first edit, so saved JSON can differ from
 * this. Seeding the normalized form means no editor has to fix it on opening, which would make
 * two people who open at once each rewrite the same table and duplicate its rows.
 */
function normalizeTable(table: PmJsonNode): PmJsonNode {
  const rows: PmJsonNode[] = []
  for (const child of table.content ?? []) {
    if (child.type === 'tableRowGroup') rows.push(...(child.content ?? []).filter((row) => row.type === 'tableRow'))
    else if (child.type === 'tableRow') rows.push(child)
  }
  const groups = rowGroups(rows)
  const grouped = groups.some((group) => group.length > 1)
  const content = grouped
    ? groups.map((group) => ({ type: 'tableRowGroup', content: rows.slice(group[0] - 1, group[group.length - 1]) }))
    : rows
  return { ...table, content }
}

/** The document with every table laid out as the editor would leave it (tables inside tables are left alone, as the plugin does). */
export function normalizeForCollaboration(node: PmJsonNode): PmJsonNode {
  if (node.type === 'table') return normalizeTable(node)
  if (!node.content) return node
  return { ...node, content: node.content.map(normalizeForCollaboration) }
}

/**
 * Fill an empty Y.Doc with a saved ProseMirror document. The encoding matches
 * `prosemirrorJSONToYXmlFragment` in @tiptap/y-tiptap (element = node type plus non-null attrs,
 * text = Y.XmlText with each mark as a format attribute), so the server needs no copy of the
 * editor schema. This schema has no marks that can overlap their own type, so mark keys are
 * plain type names.
 */
export function seedYDocFromJson(doc: Y.Doc, json: PmJsonNode): void {
  const fragment = doc.getXmlFragment(COLLAB_FIELD)
  const normalized = normalizeForCollaboration(json)
  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length)
    fragment.insert(0, childrenToY(normalized.content))
  })
}
