import { listPinnedDocuments, pinDocument, PinsUnavailableError, unpinDocument } from '../documentPinModel'

/** What the stubbed database returns, and what the model asked it. */
const state: {
  pins: unknown[] | null
  shares: Array<{ document_id: string }>
  error: { code?: string; message: string } | null
  calls: Array<{ table: string; method: string; args: unknown[] }>
  upserts: Array<{ payload: Record<string, unknown>; options: unknown }>
} = { pins: [], shares: [], error: null, calls: [], upserts: [] }

/** A chainable query that records every call and resolves per table. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'delete']) {
    query[name] = jest.fn((...args: unknown[]) => {
      state.calls.push({ table, method: name, args })
      return query
    })
  }
  query.upsert = jest.fn((payload: Record<string, unknown>, options: unknown) => {
    state.upserts.push({ payload, options })
    return { error: state.error }
  })
  query.then = (resolve: (value: unknown) => void): void =>
    resolve(table === 'document_pins' ? { data: state.pins, error: state.error } : { data: state.shares, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })) }))
jest.mock('../../utils/redisClient', () => ({ getRedisClient: jest.fn(async () => null) }))

const doc = (id: string, owner: string): Record<string, unknown> => ({ id, user_id: owner, title: id, is_deleted: false })

beforeEach(() => {
  state.pins = []
  state.shares = []
  state.error = null
  state.calls = []
  state.upserts = []
})

describe('pinDocument / unpinDocument', () => {
  it('stores one pin per user and document, and pinning again keeps it', async () => {
    await pinDocument('u1', 'd1')
    expect(state.upserts).toEqual([
      { payload: { user_id: 'u1', document_id: 'd1' }, options: { onConflict: 'user_id,document_id', ignoreDuplicates: true } },
    ])
  })

  it('removes only this user’s pin', async () => {
    await unpinDocument('u2', 'd1')
    const filters = state.calls.filter((call) => call.method === 'eq').map((call) => call.args)
    expect(state.calls.some((call) => call.method === 'delete')).toBe(true)
    expect(filters).toEqual([
      ['user_id', 'u2'],
      ['document_id', 'd1'],
    ])
  })

  it('reports a missing table as unavailable', async () => {
    state.error = { code: '42P01', message: 'relation "document_pins" does not exist' }
    await expect(pinDocument('u1', 'd1')).rejects.toBeInstanceOf(PinsUnavailableError)
    await expect(unpinDocument('u1', 'd1')).rejects.toBeInstanceOf(PinsUnavailableError)
    await expect(listPinnedDocuments('u1')).rejects.toBeInstanceOf(PinsUnavailableError)
  })
})

describe('listPinnedDocuments', () => {
  it('asks for this user’s pins on documents not in the trash, newest pin first', async () => {
    await listPinnedDocuments('u1')
    expect(state.calls.some((call) => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'u1')).toBe(true)
    expect(state.calls.some((call) => call.method === 'eq' && call.args[0] === 'documents.is_deleted' && call.args[1] === false)).toBe(true)
    expect(state.calls.find((call) => call.method === 'order')?.args).toEqual(['pinned_at', { ascending: false }])
  })

  it('lists own documents and documents still shared with the user, with the pin time', async () => {
    state.pins = [
      { pinned_at: '2026-11-10T10:00:00Z', documents: doc('mine', 'u1') },
      { pinned_at: '2026-11-09T10:00:00Z', documents: doc('shared', 'owner-2') },
      { pinned_at: '2026-11-08T10:00:00Z', documents: doc('unshared', 'owner-3') },
    ]
    state.shares = [{ document_id: 'shared' }]
    const result = await listPinnedDocuments('u1')
    // A document whose share was removed is not listed even though the pin row remains.
    expect(result.map((d) => d.id)).toEqual(['mine', 'shared'])
    expect(result[0].pinned_at).toBe('2026-11-10T10:00:00Z')
    expect(result.every((d) => d.content === '')).toBe(true)
  })
})
