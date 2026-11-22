import type { Document, EditorJson } from '../../types/index'
import { joinBody, splitBody, stripTabBreaks } from '../../utils/documentTabs'

/**
 * Document tabs against an in-memory database. A tabbed document's row holds only its skeleton (the
 * tab markers); its text is read back from the tabs with documentBody.
 */

type Row = Record<string, unknown>
const db: { documents: Row[]; document_tabs: Row[]; document_versions: Row[]; tabsMissing: boolean; tabWriteLimit: number | null } = {
  documents: [],
  document_tabs: [],
  document_versions: [],
  tabsMissing: false,
  // When set, a tab write carrying more characters than this runs past the statement timeout.
  tabWriteLimit: null,
}
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' }
const rowChars = (row: Row): number => String(row.content ?? '').length + (row.content_json ? JSON.stringify(row.content_json).length : 0)
const insertCalls: Array<{ table: string; rows: number }> = []
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
      // One row or a batch; a new document gets an id as the database would give it.
      const incoming = Array.isArray(op.payload) ? (op.payload as Row[]) : [op.payload as Row]
      if (table === 'document_tabs' && db.tabWriteLimit !== null && incoming.reduce((sum, row) => sum + rowChars(row), 0) > db.tabWriteLimit) {
        return { data: null, error: TIMEOUT }
      }
      const added = incoming.map((payload) => {
        const row: Row = { tab_id: `33333333-3333-4333-8333-33333333333${db[table].length}`, created_at: new Date().toISOString(), page_count: 0, word_count: 0, ...payload }
        if (table === 'documents') row.id = row.id ?? `doc-${db.documents.length + 1}`
        if (table === 'document_versions') row.version_id = `v-${db.document_versions.length + 1}`
        db[table].push(row)
        insertCalls.push({ table, rows: incoming.length })
        return row
      })
      return { data: added, error: null }
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

import { restoreDocumentVersion, updateDocument } from '../documentModel'
import { createTabbedDocument, deleteTab, documentBody, getTab, listTabs, mergeTabs, saveTab, splitDocument } from '../documentTabModel'

const OWNER = 'owner-1'
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const heading = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] })
const marker = (title: string) => ({ type: 'tabBreak', attrs: { tabId: null, title } })
const markerHtml = (title: string) => `<div data-tab-break="" data-title="${title}"></div>`

const BODY_HTML = '<p>Title page</p><h1>CHAPTER I</h1><p>Intro text</p><h1>CHAPTER II</h1><p>Review text</p>'
const BODY_JSON: EditorJson = { type: 'doc', content: [para('Title page'), heading('CHAPTER I'), para('Intro text'), heading('CHAPTER II'), para('Review text')] }
const SPLIT_HTML = `${markerHtml('Front matter')}<p>Title page</p>${markerHtml('Chapter 1')}<h1>CHAPTER I</h1><p>Intro text</p>${markerHtml('Chapter 2')}<h1>CHAPTER II</h1><p>Review text</p>`
/** The text a tabbed document reads back, without its markers. */
async function wholeText(doc: Document): Promise<string> {
  return stripTabBreaks(await documentBody(doc), null).content
}

/** The document row's own content holds nothing but its tab markers. */
function expectSkeleton(doc: Document, titles: string[]): void {
  expect(stripTabBreaks(doc.content, null).content).toBe('')
  expect(doc.content_json).toBeNull()
  expect(splitBody(doc.content, null)!.map((part) => part.title)).toEqual(titles)
}

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
  db.tabWriteLimit = null
  insertCalls.length = 0
})

describe('splitting a document into tabs', () => {
  it('makes one tab per marker and keeps only the markers, with their tab ids, in the document row', async () => {
    const tabs = await splitDocument(theDocument(), SPLIT_HTML, SPLIT_JSON)
    expect(tabs.map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1', 'Chapter 2'])
    expectSkeleton(theDocument(), ['Front matter', 'Chapter 1', 'Chapter 2'])
    expect(splitBody(theDocument().content, null)!.map((part) => part.tabId)).toEqual(tabs.map((tab) => tab.tab_id))
    // The text is in the tabs, unchanged.
    expect(await wholeText(theDocument())).toBe(BODY_HTML)
    expect((await getTab('d1', tabs[1].tab_id)).content_json).toEqual({ type: 'doc', content: [heading('CHAPTER I'), para('Intro text')] })
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

  it('saves one tab without copying any text into the document row, and versions that tab', async () => {
    const [, chapter1] = await listTabs('d1')
    await saveTab(theDocument(), chapter1.tab_id, {
      content: '<h1>CHAPTER I</h1><p>Rewritten intro</p>',
      content_json: { type: 'doc', content: [heading('CHAPTER I'), para('Rewritten intro')] },
      page_count: 12,
    })
    expectSkeleton(theDocument(), ['Front matter', 'Chapter 1', 'Chapter 2'])
    expect(await wholeText(theDocument())).toBe('<p>Title page</p><h1>CHAPTER I</h1><p>Rewritten intro</p><h1>CHAPTER II</h1><p>Review text</p>')
    expect((await listTabs('d1'))[1]).toMatchObject({ page_count: 12, word_count: 4 })
    await new Promise((resolve) => setImmediate(resolve))
    expect(db.document_versions).toEqual([
      expect.objectContaining({ tab_id: chapter1.tab_id, tab_title: 'Chapter 1', tab_position: 1, content: '<h1>CHAPTER I</h1><p>Rewritten intro</p>' }),
    ])
  })

  it('never takes a whole-document version of a tabbed document (it would hold only the markers)', async () => {
    await updateDocument('d1', OWNER, { title: 'Renamed thesis' })
    await new Promise((resolve) => setImmediate(resolve))
    expect(db.document_versions.filter((version) => !version.tab_id)).toEqual([])
  })

  it('restores a version of one tab over that tab only', async () => {
    const [, chapter1] = await listTabs('d1')
    await saveTab(theDocument(), chapter1.tab_id, { content: '<h1>CHAPTER I</h1><p>First draft</p>', content_json: null })
    await new Promise((resolve) => setImmediate(resolve))
    const version = db.document_versions[0]
    await saveTab(theDocument(), chapter1.tab_id, { content: '<h1>CHAPTER I</h1><p>Second draft</p>', content_json: null })
    await restoreDocumentVersion('d1', version.version_id as string, OWNER)
    expect(await wholeText(theDocument())).toBe('<p>Title page</p><h1>CHAPTER I</h1><p>First draft</p><h1>CHAPTER II</h1><p>Review text</p>')
    expect(theDocument().title).toBe('Thesis')
  })

  it('puts a deleted tab back where it was when its version is restored', async () => {
    const tabs = await listTabs('d1')
    await deleteTab(theDocument(), tabs[1].tab_id)
    const saved = db.document_versions.find((version) => version.reason === 'before_tab_deleted')!
    await restoreDocumentVersion('d1', saved.version_id as string, OWNER)
    expect((await listTabs('d1')).map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1', 'Chapter 2'])
    expectSkeleton(theDocument(), ['Front matter', 'Chapter 1', 'Chapter 2'])
    expect(await wholeText(theDocument())).toBe(BODY_HTML)
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
    const edited = (await documentBody(theDocument())).replace('Review text', 'Review, revised').replace('data-title="Chapter 2"', 'data-title="Review"')
    await updateDocument('d1', OWNER, { content: edited, content_json: null, title: 'Thesis v2' })
    const after = await listTabs('d1')
    expect(after.map((tab) => tab.tab_id)).toEqual(before.map((tab) => tab.tab_id))
    expect(after[2].title).toBe('Review')
    expect(theDocument().title).toBe('Thesis v2')
    expectSkeleton(theDocument(), ['Front matter', 'Chapter 1', 'Review'])
    expect(await wholeText(theDocument())).toContain('Review, revised')
  })

  it('merges back into one untabbed body', async () => {
    await mergeTabs(theDocument())
    expect(await listTabs('d1')).toEqual([])
    expect(theDocument().content).toBe(BODY_HTML)
    expect(theDocument().content_json).toEqual(BODY_JSON)
  })

  it('keeps a manuscript too long for one body in its tabs', async () => {
    const [, chapter1] = await listTabs('d1')
    await saveTab(theDocument(), chapter1.tab_id, { content: `<p>${'word '.repeat(1_700_000)}</p>`, content_json: null })
    await expect(mergeTabs(theDocument())).rejects.toMatchObject({ status: 413, code: 'merge_too_large' })
    expect(await listTabs('d1')).toHaveLength(3)
  })

  it('saves a version before deleting a tab, and keeps the last tab', async () => {
    const tabs = await listTabs('d1')
    await deleteTab(theDocument(), tabs[2].tab_id)
    expect(db.document_versions).toContainEqual(
      expect.objectContaining({ reason: 'before_tab_deleted', tab_id: tabs[2].tab_id, tab_position: 2, content: '<h1>CHAPTER II</h1><p>Review text</p>' }),
    )
    expect((await listTabs('d1')).map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1'])
    await deleteTab(theDocument(), tabs[1].tab_id)
    await expect(deleteTab(theDocument(), tabs[0].tab_id)).rejects.toMatchObject({ status: 409, code: 'last_tab' })
  })
})

describe('importing a manuscript the converter split into tabs', () => {
  const request = { title: 'Long thesis', content: SPLIT_HTML, content_json: SPLIT_JSON }

  it('creates the document with its tabs, the row holding only their markers', async () => {
    const doc = await createTabbedDocument(OWNER, request)
    const created = db.documents.find((row) => row.id === doc.id)! as unknown as Document
    const tabs = await listTabs(doc.id)
    expect(tabs.map((tab) => tab.title)).toEqual(['Front matter', 'Chapter 1', 'Chapter 2'])
    expectSkeleton(created, ['Front matter', 'Chapter 1', 'Chapter 2'])
    expect(await wholeText(created)).toBe(BODY_HTML)
    const json = await Promise.all(tabs.map(async (tab) => (await getTab(doc.id, tab.tab_id)).content_json))
    expect(json).toEqual([
      { type: 'doc', content: [para('Title page')] },
      { type: 'doc', content: [heading('CHAPTER I'), para('Intro text')] },
      { type: 'doc', content: [heading('CHAPTER II'), para('Review text')] },
    ])
    expect((created as unknown as Record<string, unknown>).preview_snippet).toContain('Title page')
  })

  it('inserts the tabs in batches, never the whole manuscript in one request', async () => {
    const chapter = (n: number) => `${markerHtml(`Chapter ${n}`)}<p>${'word '.repeat(400_000)}</p>`
    await createTabbedDocument(OWNER, { title: 'Huge', content: [1, 2, 3, 4].map(chapter).join(''), content_json: null })
    const tabInserts = insertCalls.filter((call) => call.table === 'document_tabs')
    expect(tabInserts.map((call) => call.rows)).toEqual([1, 1, 1, 1])
  })

  it('splits a batch that runs past the statement timeout, and saves a huge tab without its editor JSON', async () => {
    const chapter = (n: number) => `${markerHtml(`Chapter ${n}`)}<p>${'word '.repeat(50_000)}</p>`
    const content = [1, 2, 3].map(chapter).join('')
    const json = { type: 'doc', content: [1, 2, 3].flatMap((n) => [{ type: 'tabBreak', attrs: { title: `Chapter ${n}` } }, para('x'.repeat(n === 3 ? 400_000 : 10))]) } as unknown as EditorJson
    db.tabWriteLimit = 300_000 // fits one ordinary tab, not two, and not tab 3 with its JSON
    const doc = await createTabbedDocument(OWNER, { title: 'Timeout', content, content_json: json })
    db.tabWriteLimit = null
    const tabs = await listTabs(doc.id)
    expect(tabs.map((tab) => tab.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3'])
    const third = await getTab(doc.id, tabs[2].tab_id)
    expect(third.content).toContain('word word')
    expect(third.content_json).toBeNull()
    expect((await getTab(doc.id, tabs[0].tab_id)).content_json).not.toBeNull()
  })

  it('creates a body without markers as an ordinary document', async () => {
    const doc = await createTabbedDocument(OWNER, { title: 'Short', content: BODY_HTML, content_json: BODY_JSON })
    expect(await listTabs(doc.id)).toEqual([])
    expect(db.documents.find((row) => row.id === doc.id)!.content).toBe(BODY_HTML)
  })

  it('falls back to one untabbed body before migration 048', async () => {
    db.tabsMissing = true
    const doc = await createTabbedDocument(OWNER, request)
    const created = db.documents.filter((row) => row.title === 'Long thesis')
    expect(created).toHaveLength(1)
    expect(created[0].id).toBe(doc.id)
    expect(created[0].content).toBe(BODY_HTML)
    expect(created[0].content_json).toEqual(BODY_JSON)
  })
})

describe('reading a document whole', () => {
  it('returns an untabbed document as it is stored', async () => {
    expect(await documentBody(theDocument())).toBe(BODY_HTML)
  })
})
