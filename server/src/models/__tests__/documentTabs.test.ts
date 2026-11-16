import type { Document, EditorJson } from '../../types/index'
import { joinBody, splitBody, stripTabBreaks } from '../../utils/documentTabs'

/**
 * Document tabs against an in-memory database. `assemble_document_tabs` is emulated with joinBody
 * (the SQL function writes the same markers), and `snapshot_document_version` copies the document.
 */

type Row = Record<string, unknown>
const db: { documents: Row[]; document_tabs: Row[]; document_versions: Row[]; tabsMissing: boolean } = {
  documents: [],
  document_tabs: [],
  document_versions: [],
  tabsMissing: false,
}
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.document_tabs'" }

function query(table: 'documents' | 'document_tabs' | 'document_versions') {
  const filters: Array<(row: Row) => boolean> = []
  const orders: string[] = []
  let op: { kind: 'select' | 'update' | 'delete' | 'upsert' | 'insert'; payload?: unknown } = { kind: 'select' }
  const rows = (): Row[] => db[table].filter((row) => filters.every((keep) => keep(row)))
  const missing = table === 'document_tabs' && db.tabsMissing
  const run = (): { data: unknown; error: unknown } => {
    if (missing) return { data: null, error: MISSING }
    if (op.kind === 'update') {
      const hit = rows()
      for (const row of hit) Object.assign(row, op.payload as Row)
      return { data: hit, error: null }
    }
    if (op.kind === 'delete') {
      const hit = new Set(rows())
      db[table] = db[table].filter((row) => !hit.has(row))
      return { data: null, error: null }
    }
    if (op.kind === 'upsert') {
      for (const incoming of op.payload as Row[]) {
        const existing = db[table].find((row) => row.tab_id === incoming.tab_id)
        if (existing) Object.assign(existing, incoming)
        else db[table].push({ created_at: new Date().toISOString(), ...incoming })
      }
      return { data: null, error: null }
    }
    if (op.kind === 'insert') {
      const row = { tab_id: `33333333-3333-4333-8333-33333333333${db[table].length}`, created_at: new Date().toISOString(), page_count: 0, word_count: 0, ...(op.payload as Row) }
      db[table].push(row)
      return { data: [row], error: null }
    }
    let out = rows()
    if (orders.includes('position')) out = [...out].sort((a, b) => Number(a.position) - Number(b.position))
    return { data: out, error: null }
  }
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value)
    return builder
  }
  builder.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]))
    return builder
  }
  builder.order = (column: string) => {
    orders.push(column)
    return builder
  }
  builder.update = (payload: Row) => {
    op = { kind: 'update', payload }
    return builder
  }
  builder.delete = () => {
    op = { kind: 'delete' }
    return builder
  }
  builder.upsert = (payload: Row[]) => {
    op = { kind: 'upsert', payload }
    return builder
  }
  builder.insert = (payload: Row) => {
    op = { kind: 'insert', payload }
    return builder
  }
  builder.single = async () => {
    const { data, error } = run()
    if (error) return { data: null, error }
    const list = data as Row[]
    return list?.[0] ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
  }
  builder.maybeSingle = async () => {
    const { data, error } = run()
    return error ? { data: null, error } : { data: (data as Row[])[0] ?? null, error: null }
  }
  builder.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => resolve(run())
  return builder
}

function assembleInMemory(documentId: string): void {
  const tabs = db.document_tabs
    .filter((row) => row.document_id === documentId)
    .sort((a, b) => Number(a.position) - Number(b.position)) as Array<{ tab_id: string; title: string; content: string; content_json: EditorJson | null }>
  const doc = db.documents.find((row) => row.id === documentId)!
  if (tabs.length === 0) return
  Object.assign(doc, joinBody(tabs))
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: 'documents' | 'document_tabs' | 'document_versions') => query(table)),
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (db.tabsMissing) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } }
      if (name === 'assemble_document_tabs') assembleInMemory(args.p_document_id as string)
      if (name === 'snapshot_document_version') {
        const doc = db.documents.find((row) => row.id === args.p_document_id)!
        db.document_versions.push({ document_id: doc.id, content: doc.content, content_json: doc.content_json, reason: args.p_reason })
      }
      return { data: null, error: null }
    }),
  })),
}))
jest.mock('../../utils/redisClient', () => ({
  getRedisClient: jest.fn(async () => ({ get: async () => null, set: async () => 'OK', del: async () => 1 })),
}))
jest.mock('../userModel', () => ({ assertWithinStorageQuota: jest.fn(async () => undefined) }))

import { updateDocument } from '../documentModel'
import { deleteTab, listTabs, mergeTabs, saveTab, splitDocument } from '../documentTabModel'

const OWNER = 'owner-1'
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const heading = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] })
const marker = (title: string) => ({ type: 'tabBreak', attrs: { tabId: null, title } })
const markerHtml = (title: string) => `<div data-tab-break="" data-title="${title}"></div>`

const BODY_HTML = '<p>Title page</p><h1>CHAPTER I</h1><p>Intro text</p><h1>CHAPTER II</h1><p>Review text</p>'
const BODY_JSON: EditorJson = { type: 'doc', content: [para('Title page'), heading('CHAPTER I'), para('Intro text'), heading('CHAPTER II'), para('Review text')] }
const SPLIT_HTML = `${markerHtml('Front matter')}<p>Title page</p>${markerHtml('Chapter 1')}<h1>CHAPTER I</h1><p>Intro text</p>${markerHtml('Chapter 2')}<h1>CHAPTER II</h1><p>Review text</p>`
const SPLIT_JSON: EditorJson = {
  type: 'doc',
  content: [marker('Front matter'), para('Title page'), marker('Chapter 1'), heading('CHAPTER I'), para('Intro text'), marker('Chapter 2'), heading('CHAPTER II'), para('Review text')],
}

function theDocument(): Document {
  return db.documents[0] as unknown as Document
}

beforeEach(() => {
  db.documents = [{ id: 'd1', user_id: OWNER, title: 'Thesis', content: BODY_HTML, content_json: BODY_JSON }]
  db.document_tabs = []
  db.document_versions = []
  db.tabsMissing = false
})

describe('splitting a document into tabs', () => {
  it('makes one tab per marker and writes every marker back with its tab id', async () => {
    const tabs = await splitDocument(theDocument(), SPLIT_HTML, SPLIT_JSON)
    expect(tabs.map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1', 'Chapter 2'])
    const parts = splitBody(theDocument().content, theDocument().content_json)!
    expect(parts.map((part) => part.tabId)).toEqual(tabs.map((tab) => tab.tab_id))
    // Nothing but the markers changed.
    expect(stripTabBreaks(theDocument().content, theDocument().content_json)).toEqual({ content: BODY_HTML, content_json: BODY_JSON })
  })

  it('refuses a split whose text differs from the saved document', async () => {
    await expect(splitDocument(theDocument(), SPLIT_HTML.replace('Intro text', 'Edited'), null)).rejects.toMatchObject({ status: 409 })
    expect(db.document_tabs).toHaveLength(0)
  })

  it('reports tabs as unavailable before migration 048', async () => {
    db.tabsMissing = true
    expect(await listTabs('d1')).toEqual([])
    await expect(splitDocument(theDocument(), SPLIT_HTML, SPLIT_JSON)).rejects.toMatchObject({ status: 503, code: 'tabs_unavailable' })
  })
})

describe('a document with tabs', () => {
  beforeEach(async () => {
    await splitDocument(theDocument(), SPLIT_HTML, SPLIT_JSON)
  })

  it('saves one tab and rebuilds the whole body around it', async () => {
    const [, chapter1] = await listTabs('d1')
    await saveTab(theDocument(), chapter1.tab_id, {
      content: '<h1>CHAPTER I</h1><p>Rewritten intro</p>',
      content_json: { type: 'doc', content: [heading('CHAPTER I'), para('Rewritten intro')] },
      page_count: 12,
    })
    const merged = stripTabBreaks(theDocument().content, theDocument().content_json)
    expect(merged.content).toBe('<p>Title page</p><h1>CHAPTER I</h1><p>Rewritten intro</p><h1>CHAPTER II</h1><p>Review text</p>')
    expect((await listTabs('d1'))[1]).toMatchObject({ page_count: 12, word_count: 4 })
  })

  it('refuses a whole-body save that would drop the tabs', async () => {
    await expect(updateDocument('d1', OWNER, { content: BODY_HTML, content_json: BODY_JSON })).rejects.toMatchObject({
      status: 409,
      code: 'document_has_tabs',
    })
    expect(await listTabs('d1')).toHaveLength(3)
  })

  it('re-syncs the tabs from a whole-body save that keeps the markers', async () => {
    const before = await listTabs('d1')
    // The editor showing the whole body edits chapter 2 and renames it.
    const edited = theDocument().content.replace('Review text', 'Review, revised').replace('data-title="Chapter 2"', 'data-title="Review"')
    await updateDocument('d1', OWNER, { content: edited, content_json: null, title: 'Thesis v2' })
    const after = await listTabs('d1')
    expect(after.map((tab) => tab.tab_id)).toEqual(before.map((tab) => tab.tab_id))
    expect(after[2].title).toBe('Review')
    expect(theDocument().title).toBe('Thesis v2')
    expect(stripTabBreaks(theDocument().content, null).content).toContain('Review, revised')
  })

  it('merges back into one untabbed body', async () => {
    await mergeTabs(theDocument())
    expect(await listTabs('d1')).toEqual([])
    expect(theDocument().content).toBe(BODY_HTML)
    expect(theDocument().content_json).toEqual(BODY_JSON)
  })

  it('saves a version before deleting a tab, and keeps the last tab', async () => {
    const tabs = await listTabs('d1')
    await deleteTab(theDocument(), tabs[2].tab_id)
    expect(db.document_versions.some((version) => version.reason === 'before_tab_deleted' && String(version.content).includes('Review text'))).toBe(true)
    expect((await listTabs('d1')).map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1'])
    await deleteTab(theDocument(), tabs[1].tab_id)
    await expect(deleteTab(theDocument(), tabs[0].tab_id)).rejects.toMatchObject({ status: 409, code: 'last_tab' })
  })
})
