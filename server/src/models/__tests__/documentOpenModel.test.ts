import { listRecentDocuments, recordOpen, RecentUnavailableError, RECENT_WINDOW_MS } from '../documentOpenModel'

/** What the stubbed database returns, and what the model asked it. */
const state: {
  opens: unknown[] | null
  shares: Array<{ document_id: string }>
  error: { code?: string; message: string } | null
  calls: Array<{ table: string; method: string; args: unknown[] }>
  upserts: Array<Record<string, unknown>>
} = { opens: [], shares: [], error: null, calls: [], upserts: [] }

/** A chainable query that records every call and resolves per table. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'gte', 'order']) {
    query[name] = jest.fn((...args: unknown[]) => {
      state.calls.push({ table, method: name, args })
      return query
    })
  }
  query.upsert = jest.fn((payload: Record<string, unknown>) => {
    state.upserts.push(payload)
    return { error: state.error }
  })
  query.then = (resolve: (value: unknown) => void): void =>
    resolve(table === 'document_opens' ? { data: state.opens, error: state.error } : { data: state.shares, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })) }))
jest.mock('../../utils/redisClient', () => ({ getRedisClient: jest.fn(async () => null) }))

const doc = (id: string, owner: string): Record<string, unknown> => ({ id, user_id: owner, title: id, is_deleted: false })

describe('recordOpen', () => {
  beforeEach(() => {
    state.error = null
    state.upserts = []
  })

  it('stores one row per user and document with the time of this open', async () => {
    await recordOpen('u1', 'd1')
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toMatchObject({ user_id: 'u1', document_id: 'd1' })
    expect(Date.now() - new Date(String(state.upserts[0].last_opened_at)).getTime()).toBeLessThan(5000)
  })

  it('reports a missing table as unavailable', async () => {
    state.error = { code: '42P01', message: 'relation "document_opens" does not exist' }
    await expect(recordOpen('u1', 'd1')).rejects.toBeInstanceOf(RecentUnavailableError)
  })
})

describe('listRecentDocuments', () => {
  beforeEach(() => {
    state.opens = []
    state.shares = []
    state.error = null
    state.calls = []
  })

  it('asks only for the last 7 days of this user, newest open first', async () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    await listRecentDocuments('u1', now)
    const gte = state.calls.find((call) => call.method === 'gte')
    expect(gte?.args[0]).toBe('last_opened_at')
    expect(new Date(String(gte?.args[1])).getTime()).toBe(now - RECENT_WINDOW_MS)
    expect(state.calls.find((call) => call.method === 'order')?.args).toEqual(['last_opened_at', { ascending: false }])
    expect(state.calls.some((call) => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'u1')).toBe(true)
    expect(state.calls.some((call) => call.method === 'eq' && call.args[0] === 'documents.is_deleted' && call.args[1] === false)).toBe(true)
  })

  it('returns the documents in the order the database gave, with the time they were opened', async () => {
    state.opens = [
      { last_opened_at: '2026-10-28T10:00:00Z', documents: doc('new', 'u1') },
      { last_opened_at: '2026-10-25T10:00:00Z', documents: doc('old', 'u1') },
    ]
    const result = await listRecentDocuments('u1')
    expect(result.map((d) => d.id)).toEqual(['new', 'old'])
    expect(result[0].last_opened_at).toBe('2026-10-28T10:00:00Z')
    expect(result[0].content).toBe('')
  })

  it('keeps a document someone else owns only while it is still shared with the user', async () => {
    state.opens = [
      { last_opened_at: '2026-10-28T10:00:00Z', documents: doc('shared-still', 'prof') },
      { last_opened_at: '2026-10-27T10:00:00Z', documents: doc('unshared', 'prof') },
      { last_opened_at: '2026-10-26T10:00:00Z', documents: doc('mine', 'u1') },
    ]
    state.shares = [{ document_id: 'shared-still' }]
    const result = await listRecentDocuments('u1')
    expect(result.map((d) => d.id)).toEqual(['shared-still', 'mine'])
  })

  it('skips rows whose document no longer exists', async () => {
    state.opens = [{ last_opened_at: '2026-10-28T10:00:00Z', documents: null }]
    expect(await listRecentDocuments('u1')).toEqual([])
  })

  it('reports a missing table as unavailable', async () => {
    state.error = { code: 'PGRST205', message: 'Could not find the table' }
    await expect(listRecentDocuments('u1')).rejects.toBeInstanceOf(RecentUnavailableError)
  })
})
