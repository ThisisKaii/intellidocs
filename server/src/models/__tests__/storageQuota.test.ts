import { assertWithinStorageQuota, clearStorageCache, STORAGE_QUOTA_BYTES } from '../userModel'

/** What the stubbed database returns for the storage lookups. */
const state: { used: number | Error; role: string; rpcCalls: number } = { used: 0, role: 'student', rpcCalls: 0 }

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => {
      const query: Record<string, unknown> = {}
      query.select = jest.fn(() => query)
      query.eq = jest.fn(() => query)
      query.maybeSingle = jest.fn(async () => ({ data: { roles: { role_name: state.role } }, error: null }))
      return query
    }),
    rpc: jest.fn(async () => {
      state.rpcCalls += 1
      if (state.used instanceof Error) return { data: null, error: { message: state.used.message } }
      return { data: state.used, error: null }
    }),
  })),
}))

const MB = 1024 * 1024

describe('storage quotas', () => {
  beforeEach(() => {
    state.used = 0
    state.role = 'student'
    state.rpcCalls = 0
    clearStorageCache('u1')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('keeps accounts small enough for a free-tier database', () => {
    expect(STORAGE_QUOTA_BYTES.student).toBe(25 * MB)
    expect(STORAGE_QUOTA_BYTES.professor).toBe(50 * MB)
    expect(STORAGE_QUOTA_BYTES.admin).toBe(100 * MB)
  })

  it('allows a save that fits', async () => {
    state.used = 10 * MB
    await expect(assertWithinStorageQuota('u1', 1 * MB)).resolves.toBeUndefined()
  })

  it('refuses a save past the quota with a 413 and a code', async () => {
    state.used = 24 * MB
    await expect(assertWithinStorageQuota('u1', 2 * MB)).rejects.toMatchObject({ status: 413, code: 'storage_quota_exceeded' })
  })

  it('always allows a save that shrinks or keeps the size, even when over quota', async () => {
    state.used = 30 * MB
    await expect(assertWithinStorageQuota('u1', 0)).resolves.toBeUndefined()
    await expect(assertWithinStorageQuota('u1', -500)).resolves.toBeUndefined()
    expect(state.rpcCalls).toBe(0)
  })

  it('allows the save when the size query fails', async () => {
    state.used = new Error('statement timeout')
    await expect(assertWithinStorageQuota('u1', 5 * MB)).resolves.toBeUndefined()
  })

  it('uses the higher quota for a professor', async () => {
    state.role = 'professor'
    state.used = 30 * MB
    await expect(assertWithinStorageQuota('u1', 5 * MB)).resolves.toBeUndefined()
  })

  it('counts saves made since the last reading, so a quick burst cannot overshoot the quota', async () => {
    state.used = 22 * MB
    await assertWithinStorageQuota('u1', 1 * MB)
    await assertWithinStorageQuota('u1', 1 * MB)
    await assertWithinStorageQuota('u1', 1 * MB) // now at 25 MB
    await expect(assertWithinStorageQuota('u1', 1 * MB)).rejects.toMatchObject({ code: 'storage_quota_exceeded' })
    expect(state.rpcCalls).toBe(1)
  })

  it('reuses the size for frequent autosaves instead of querying each time', async () => {
    state.used = 1 * MB
    await assertWithinStorageQuota('u1', 100)
    await assertWithinStorageQuota('u1', 200)
    await assertWithinStorageQuota('u1', 300)
    expect(state.rpcCalls).toBe(1)
  })
})
