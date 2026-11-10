import { listDocuments, updateDocument } from '../documentModel'

/** The stubbed document row and every update the model sent. */
const state: { doc: Record<string, unknown>; updates: Array<Record<string, unknown>> } = { doc: {}, updates: [] }

/** A chainable query: reads resolve to the stored row, updates are recorded. */
function makeQuery(): Record<string, unknown> {
  let pending: Record<string, unknown> | null = null
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'limit']) query[name] = jest.fn(() => query)
  query.update = jest.fn((payload: Record<string, unknown>) => {
    pending = payload
    return query
  })
  query.maybeSingle = jest.fn(async () => ({ data: null, error: null }))
  query.single = jest.fn(async () => {
    if (pending) {
      state.updates.push(pending)
      state.doc = { ...state.doc, ...pending }
    }
    return { data: state.doc, error: null }
  })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn(() => makeQuery()) })) }))
jest.mock('../../utils/redisClient', () => ({
  getRedisClient: jest.fn(async () => ({ get: async () => null, set: async () => 'OK', del: async () => 1 })),
}))
jest.mock('../userModel', () => ({ assertWithinStorageQuota: jest.fn(async () => undefined) }))

const OWNER = 'owner-1'
const EDITOR = 'editor-2'

beforeEach(() => {
  state.updates = []
  state.doc = {
    id: 'doc-1',
    user_id: OWNER,
    title: 'Thesis',
    content: '<p>Body</p>',
    is_pinned: false,
    // A share link with edit permission: the editor may change the document, not its pin.
    share_token: 'link-1',
    share_permission: 'edit',
    share_expires_at: null,
    is_deleted: false,
  }
})

describe('listDocuments column fallbacks', () => {
  const missing = { data: null, error: { code: '42703', message: 'column does not exist' } }

  it('asks for is_pinned and the preview snippet first', async () => {
    const asked: string[] = []
    await listDocuments((columns) => {
      asked.push(columns)
      return Promise.resolve({ data: [], error: null })
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('is_pinned')
    expect(asked[0]).toContain('preview_snippet')
  })

  it('drops is_pinned while migration 041 is not applied, keeping the preview', async () => {
    const asked: string[] = []
    const result = await listDocuments<{ id: string }>((columns) => {
      asked.push(columns)
      return Promise.resolve(columns.includes('is_pinned') ? missing : { data: [{ id: 'a' }], error: null })
    })
    expect(result.data).toEqual([{ id: 'a' }])
    expect(asked[1]).toContain('preview_snippet')
    expect(asked[1]).not.toContain('is_pinned')
  })

  it('falls back to the legacy columns when neither migration is applied', async () => {
    const asked: string[] = []
    const result = await listDocuments<{ id: string }>((columns) => {
      asked.push(columns)
      return Promise.resolve(columns.includes('is_pinned') || columns.includes('preview_snippet') ? missing : { data: [], error: null })
    })
    expect(result.error).toBeNull()
    expect(asked).toHaveLength(3)
  })
})

describe('pinning a document', () => {
  it('lets the owner pin it', async () => {
    const updated = await updateDocument('doc-1', OWNER, { is_pinned: true })
    expect(updated.is_pinned).toBe(true)
    expect(state.updates).toEqual([expect.objectContaining({ is_pinned: true })])
  })

  it('refuses a collaborator who may otherwise edit the document', async () => {
    await expect(updateDocument('doc-1', EDITOR, { is_pinned: true }, 'link-1')).rejects.toMatchObject({ status: 403 })
    expect(state.updates).toEqual([])
  })

  it('still lets that collaborator edit the text', async () => {
    await updateDocument('doc-1', EDITOR, { title: 'Thesis (edited)' }, 'link-1')
    expect(state.updates).toEqual([expect.objectContaining({ title: 'Thesis (edited)' })])
  })
})
