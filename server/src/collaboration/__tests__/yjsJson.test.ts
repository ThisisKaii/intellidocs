import * as Y from 'yjs'
import { COLLAB_FIELD, isPmDoc, normalizeForCollaboration, seedYDocFromJson, type PmJsonNode } from '../yjsJson'

const DOC: PmJsonNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, textAlign: null }, content: [{ type: 'text', text: 'Title' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'center', indent: null },
      content: [
        { type: 'text', text: 'plain ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' red', marks: [{ type: 'textStyle', attrs: { color: '#f00', fontSize: null } }] },
      ],
    },
    { type: 'pageBreak' },
    { type: 'paragraph' },
  ],
}

describe('seedYDocFromJson', () => {
  it('encodes nodes, attributes and marks the way y-tiptap reads them', () => {
    const doc = new Y.Doc()
    seedYDocFromJson(doc, DOC)
    const fragment = doc.getXmlFragment(COLLAB_FIELD)
    const [heading, paragraph, pageBreak, empty] = fragment.toArray() as Y.XmlElement[]

    expect(heading.nodeName).toBe('heading')
    expect(heading.getAttributes()).toEqual({ level: 1 }) // null attrs are left out
    expect(paragraph.getAttributes()).toEqual({ textAlign: 'center' })

    // Adjacent text nodes become one XmlText; each mark is a format attribute.
    const texts = paragraph.toArray()
    expect(texts).toHaveLength(1)
    expect((texts[0] as Y.XmlText).toDelta()).toEqual([
      { insert: 'plain ' },
      { insert: 'bold', attributes: { bold: {} } },
      { insert: ' red', attributes: { textStyle: { color: '#f00', fontSize: null } } },
    ])

    expect(pageBreak.nodeName).toBe('pageBreak')
    expect(pageBreak.length).toBe(0)
    expect(empty.length).toBe(0)
  })

  it('replaces whatever the fragment held before', () => {
    const doc = new Y.Doc()
    seedYDocFromJson(doc, DOC)
    seedYDocFromJson(doc, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'only' }] }] })
    expect(doc.getXmlFragment(COLLAB_FIELD).length).toBe(1)
  })
})

describe('normalizeForCollaboration', () => {
  const cell = (text: string, rowspan = 1): PmJsonNode => ({
    type: 'tableCell',
    attrs: { rowspan, colspan: 1 },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  const row = (...cells: PmJsonNode[]): PmJsonNode => ({ type: 'tableRow', content: cells })
  const shape = (table: PmJsonNode): string[] =>
    (table.content ?? []).map((child) => (child.type === 'tableRowGroup' ? `group(${child.content?.length})` : 'row'))

  it('unwraps the <tbody> group of a plain table, as table-plus does', () => {
    const table = { type: 'table', attrs: { align: 'center' }, content: [{ type: 'tableRowGroup', content: [row(cell('a')), row(cell('b'))] }] }
    const out = normalizeForCollaboration({ type: 'doc', content: [table] }).content![0]
    expect(shape(out)).toEqual(['row', 'row'])
    expect(out.attrs).toEqual({ align: 'center' })
  })

  it('groups rows a spanning cell holds together, and wraps the other rows singly', () => {
    const table = { type: 'table', content: [row(cell('tall', 2), cell('r1')), row(cell('r2')), row(cell('c3'), cell('d3'))] }
    const out = normalizeForCollaboration({ type: 'doc', content: [table] }).content![0]
    expect(shape(out)).toEqual(['group(2)', 'group(1)'])
  })

  it('merges overlapping spans into one group', () => {
    const table = { type: 'table', content: [row(cell('x', 2)), row(cell('y', 2)), row(cell('z')), row(cell('w'))] }
    const out = normalizeForCollaboration({ type: 'doc', content: [table] }).content![0]
    expect(shape(out)).toEqual(['group(3)', 'group(1)'])
  })
})

describe('isPmDoc', () => {
  it('accepts a saved document and rejects anything else', () => {
    expect(isPmDoc(DOC)).toBe(true)
    expect(isPmDoc({ type: 'doc' })).toBe(true)
    expect(isPmDoc(null)).toBe(false)
    expect(isPmDoc('<p>html</p>')).toBe(false)
    expect(isPmDoc({ type: 'paragraph', content: [] })).toBe(false)
  })
})
