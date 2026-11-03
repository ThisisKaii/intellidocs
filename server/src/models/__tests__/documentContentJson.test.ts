import { contentBytes, restoreDocumentVersion, snapshotDocumentVersion, updateDocument } from '../documentModel'
import { assertWithinStorageQuota } from '../userModel'
import type { Document, EditorJson } from '../../types/index'

/** What the stubbed database holds, and every write the model sent it. */
const state: {
  doc: Record<string, unknown>
  version: Record<string, unknown> | null
  /** False until migration 037 is applied: writes naming content_json fail as a missing column. */
  migrated: boolean
  updates: Array<Record<string, unknown>>
  inserts: Array<Record<string, unknown>>
} = { doc: {}, version: null, migrated: true, updates: [], inserts: [] }

const MISSING_COLUMN = { code: 'PGRST204', message: "Could not find the 'content_json' column" }

/** A chainable query: reads resolve to the stored row, writes are recorded and checked against the migration. */
function makeQuery(table: string): Record<string, unknown> {
  let pending: Record<string, unknown> | null = null
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'order', 'limit']) query[name] = jest.fn(() => query)
  query.update = jest.fn((payload: Record<string, unknown>) => {
    pending = payload
    return query
  })
  query.insert = jest.fn((payload: Record<string, unknown>) => {
    if (!state.migrated && 'content_json' in payload) return Promise.resolve({ error: MISSING_COLUMN })
    state.inserts.push(payload)
    return Promise.resolve({ error: null })
  })
  query.single = jest.fn(async () => {
    if (table === 'document_versions') return { data: state.version, error: null }
    if (pending) {
      if (!state.migrated && 'content_json' in pending) return { data: null, error: MISSING_COLUMN }
      state.updates.push(pending)
      state.doc = { ...state.doc, ...pending }
    }
    return { data: state.doc, error: null }
  })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })) }))
jest.mock('../../utils/redisClient', () => ({
  getRedisClient: jest.fn(async () => ({ get: async () => null, set: async () => 'OK', del: async () => 1 })),
}))
jest.mock('../userModel', () => ({ assertWithinStorageQuota: jest.fn(async () => undefined) }))

const OWNER = 'owner-1'
const json = (text: string): EditorJson => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  state.doc = { id: 'd1', user_id: OWNER, title: 'Thesis', content: '<p>old</p>', content_json: json('old') }
  state.version = null
  state.migrated = true
  state.updates = []
  state.inserts = []
  jest.mocked(assertWithinStorageQuota).mockClear()
})

describe('updateDocument content_json', () => {
  it('stores the JSON sent with the HTML', async () => {
    await updateDocument('d1', OWNER, { content: '<p>new</p>', content_json: json('new') })
    expect(state.updates[0]).toMatchObject({ content: '<p>new</p>', content_json: json('new') })
  })

  it('clears stored JSON when HTML is written without it, so stale JSON never loads over newer HTML', async () => {
    await updateDocument('d1', OWNER, { content: '<p>from an import</p>' })
    expect(state.updates[0]).toHaveProperty('content_json', null)
  })

  it('leaves the JSON alone when the content is not part of the update', async () => {
    await updateDocument('d1', OWNER, { title: 'Renamed' })
    expect(state.updates[0]).not.toHaveProperty('content_json')
  })

  it('still saves the HTML before migration 037 is applied', async () => {
    state.migrated = false
    await updateDocument('d1', OWNER, { content: '<p>new</p>', content_json: json('new') })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ content: '<p>new</p>' })
    expect(state.updates[0]).not.toHaveProperty('content_json')
  })

  it('charges the quota for the JSON in place of the HTML', async () => {
    const next = json('a much longer paragraph than before')
    await updateDocument('d1', OWNER, { content: '<p>x</p>', content_json: next })
    const expected = Buffer.byteLength(JSON.stringify(next)) - Buffer.byteLength(JSON.stringify(json('old')))
    expect(assertWithinStorageQuota).toHaveBeenCalledWith(OWNER, expected)
  })
})

describe('contentBytes', () => {
  it('counts the JSON when present, else the HTML', () => {
    expect(contentBytes('<p>abc</p>', null)).toBe(10)
    expect(contentBytes('<p>abc</p>', json('abc'))).toBe(Buffer.byteLength(JSON.stringify(json('abc'))))
  })
})

describe('versions', () => {
  it('snapshots the JSON with the HTML', async () => {
    await snapshotDocumentVersion(state.doc as unknown as Document)
    expect(state.inserts[0]).toMatchObject({ content: '<p>old</p>', content_json: json('old') })
  })

  it('still snapshots before migration 037 is applied', async () => {
    state.migrated = false
    await snapshotDocumentVersion(state.doc as unknown as Document)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).not.toHaveProperty('content_json')
  })

  it('restores a version with its JSON', async () => {
    state.version = { version_id: 'v1', document_id: 'd1', content: '<p>v1</p>', content_json: json('v1'), title: 'Thesis', editor_prefs: null }
    await restoreDocumentVersion('d1', 'v1', OWNER)
    expect(state.updates[0]).toMatchObject({ content: '<p>v1</p>', content_json: json('v1') })
  })

  it('restoring a version from before JSON clears the document JSON', async () => {
    state.version = { version_id: 'v0', document_id: 'd1', content: '<p>v0</p>', title: 'Thesis', editor_prefs: null }
    await restoreDocumentVersion('d1', 'v0', OWNER)
    expect(state.updates[0]).toMatchObject({ content: '<p>v0</p>', content_json: null })
    await flush()
  })
})
