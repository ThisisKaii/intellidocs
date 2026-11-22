/**
 * A session check that cannot reach Supabase is a 503 "try again", never a 401 that signs the user
 * out; a token Supabase refuses is still a 401.
 */
const getUser = jest.fn()

jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js')
  return { ...actual, createClient: () => ({ auth: { getUser } }) }
})

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { verifyAccessToken } from '../authMiddleware'

const user = { id: 'u1', email: 'someone@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' }

beforeEach(() => getUser.mockReset())

it('answers 401 for a token Supabase refuses', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') })
  expect(await verifyAccessToken('bad')).toMatchObject({ ok: false, error: expect.stringContaining('401') })
  expect(getUser).toHaveBeenCalledTimes(1)
})

it('retries once, then reports auth_unavailable when Supabase cannot be reached', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
  expect(await verifyAccessToken('token')).toMatchObject({ ok: false, code: 'auth_unavailable' })
  expect(getUser).toHaveBeenCalledTimes(2)
})

it('treats a thrown network error the same way', async () => {
  getUser.mockRejectedValue(new TypeError('fetch failed'))
  expect(await verifyAccessToken('token')).toMatchObject({ ok: false, code: 'auth_unavailable' })
})

it('accepts the session when the retry gets through', async () => {
  getUser
    .mockResolvedValueOnce({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
    .mockResolvedValueOnce({ data: { user }, error: null })
  expect(await verifyAccessToken('token')).toEqual({ ok: true, user: { id: 'u1', email: 'someone@example.test' } })
})
