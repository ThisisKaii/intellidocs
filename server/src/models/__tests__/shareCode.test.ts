import { joinByShareCode, ShareCodeError } from '../shareModel'

type Doc = Record<string, unknown> | null

/** What the stubbed database returns and what the model wrote to it. */
const state: {
  doc: Doc
  docError: { code?: string; message: string } | null
  existing: Array<Record<string, unknown>>
  inserts: Array<Record<string, unknown>>
  updates: Array<Record<string, unknown>>
} = { doc: null, docError: null, existing: [], inserts: [], updates: [] }

/** A chainable query per table that records inserts and updates. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'eq', 'limit']) query[name] = jest.fn(self)
  query.maybeSingle = jest.fn(async () => ({ data: state.doc, error: state.docError }))
  query.single = jest.fn(async () => ({ data: { share_id: 's-new' }, error: null }))
  query.insert = jest.fn((payload: Record<string, unknown>) => {
    state.inserts.push(payload)
    return query
  })
  query.update = jest.fn((payload: Record<string, unknown>) => {
    state.updates.push(payload)
    return query
  })
  query.then = (resolve: (value: unknown) => void): void =>
    resolve(table === 'document_shares' ? { data: state.existing, error: null } : { data: null, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })) }))

const NOW = Date.parse('2026-10-28T12:00:00Z')
const liveDoc = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'd1', user_id: 'owner', title: 'Thesis', is_deleted: false,
  share_token: 'tok', share_permission: 'comment', share_expires_at: null, ...patch,
})

describe('joinByShareCode', () => {
  beforeEach(() => {
    state.doc = liveDoc()
    state.docError = null
    state.existing = []
    state.inserts = []
    state.updates = []
  })

  it('adds the document to the user with the link permission', async () => {
    const result = await joinByShareCode('u1', 'K7M2QX9P', NOW)
    expect(result).toEqual({ documentId: 'd1', title: 'Thesis', permission: 'comment', alreadyShared: false })
    expect(state.inserts).toEqual([{ document_id: 'd1', owner_id: 'owner', shared_with: 'u1', pending_email: null, permission: 'comment' }])
  })

  it('refuses your own document', async () => {
    state.doc = liveDoc({ user_id: 'u1' })
    await expect(joinByShareCode('u1', 'K7M2QX9P', NOW)).rejects.toMatchObject({ status: 400 })
    expect(state.inserts).toHaveLength(0)
  })

  it.each([
    ['an unknown code', null],
    ['a trashed document', liveDoc({ is_deleted: true })],
    ['a revoked link', liveDoc({ share_token: null })],
    ['an expired link', liveDoc({ share_expires_at: '2026-10-27T00:00:00Z' })],
  ])('answers 404 for %s', async (_name, doc) => {
    state.doc = doc as Doc
    await expect(joinByShareCode('u1', 'K7M2QX9P', NOW)).rejects.toBeInstanceOf(ShareCodeError)
    await expect(joinByShareCode('u1', 'K7M2QX9P', NOW)).rejects.toMatchObject({ status: 404 })
    expect(state.inserts).toHaveLength(0)
  })

  it('keeps an existing share and upgrades it when the code grants more', async () => {
    state.existing = [{ share_id: 's1', permission: 'view' }]
    const result = await joinByShareCode('u1', 'K7M2QX9P', NOW)
    expect(result).toMatchObject({ permission: 'comment', alreadyShared: true })
    expect(state.updates).toEqual([{ permission: 'comment' }])
    expect(state.inserts).toHaveLength(0)
  })

  it('never lowers an existing share', async () => {
    state.existing = [{ share_id: 's1', permission: 'edit' }]
    const result = await joinByShareCode('u1', 'K7M2QX9P', NOW)
    expect(result).toMatchObject({ permission: 'edit', alreadyShared: true })
    expect(state.updates).toHaveLength(0)
  })

  it('says codes are not available while migration 035 is missing', async () => {
    state.doc = null
    state.docError = { code: '42703', message: 'column documents.share_code does not exist' }
    await expect(joinByShareCode('u1', 'K7M2QX9P', NOW)).rejects.toMatchObject({ status: 503 })
  })
})
