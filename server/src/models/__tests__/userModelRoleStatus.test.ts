import { getOwnRoleStatus } from '../../models/userModel'

/**
 * Stub the Supabase client so the role lookup can be asserted without a
 * network round trip. The chainable query object is exposed on the mock so each
 * test can decide what row the database would return.
 */
jest.mock('@supabase/supabase-js', () => {
  const chain: {
    select: jest.Mock
    eq: jest.Mock
    maybeSingle: jest.Mock
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return {
    createClient: jest.fn(() => ({ from: jest.fn(() => chain) })),
    __chain: chain,
  }
})

/** The stubbed query chain, typed for assertions. */
function chainMock(): {
  select: jest.Mock
  eq: jest.Mock
  maybeSingle: jest.Mock
} {
  return (jest.requireMock('@supabase/supabase-js') as { __chain: unknown }).__chain as {
    select: jest.Mock
    eq: jest.Mock
    maybeSingle: jest.Mock
  }
}

/** Make the stubbed profile lookup resolve with the given row. */
function givenProfileRow(row: unknown): void {
  chainMock().maybeSingle.mockResolvedValue({ data: row, error: null })
}

describe('getOwnRoleStatus', () => {
  it('reports a newly submitted application as pending professor', async () => {
    givenProfileRow({ verification_status: 'pending', roles: { role_name: 'professor' } })

    await expect(getOwnRoleStatus('user-1')).resolves.toEqual({
      role: 'professor',
      verificationStatus: 'pending',
      requestedRole: null,
    })
  })

  it('reflects an approval granted after the client cached a pending status', async () => {
    // The whole point of this lookup: the client still holds 'pending' from
    // login, and the administrator's approval is only visible in the database.
    givenProfileRow({ verification_status: 'approved', roles: { role_name: 'professor' } })

    const status = await getOwnRoleStatus('user-1')

    expect(status.role).toBe('professor')
    expect(status.verificationStatus).toBe('approved')
  })

  it('reports a rejection', async () => {
    givenProfileRow({ verification_status: 'rejected', roles: { role_name: 'professor' } })

    await expect(getOwnRoleStatus('user-1')).resolves.toEqual({
      role: 'professor',
      verificationStatus: 'rejected',
      requestedRole: null,
    })
  })

  it('falls back to an approved student when no profile row exists yet', async () => {
    givenProfileRow(null)

    await expect(getOwnRoleStatus('user-1')).resolves.toEqual({
      role: 'student',
      verificationStatus: 'approved',
      requestedRole: null,
    })
  })

  it('falls back to an approved student when the role join is missing', async () => {
    givenProfileRow({ verification_status: 'pending', roles: null })

    await expect(getOwnRoleStatus('user-1')).resolves.toEqual({
      role: 'student',
      verificationStatus: 'pending',
      requestedRole: null,
    })
  })

  it('queries the profile of the requested user only', async () => {
    givenProfileRow({ verification_status: 'approved', roles: { role_name: 'student' } })

    await getOwnRoleStatus('user-42')

    expect(chainMock().eq).toHaveBeenCalledWith('user_id', 'user-42')
  })
})
