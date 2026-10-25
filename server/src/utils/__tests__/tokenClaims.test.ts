import { isMissingSecondFactor, tokenAssuranceLevel } from '../tokenClaims'

/** Build an unsigned JWT-shaped string carrying the given claims. */
function tokenWith(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`
}

describe('tokenAssuranceLevel', () => {
  it('reads the aal claim', () => {
    expect(tokenAssuranceLevel(tokenWith({ aal: 'aal2' }))).toBe('aal2')
    expect(tokenAssuranceLevel(tokenWith({ aal: 'aal1' }))).toBe('aal1')
  })

  it('returns null for a missing claim or a malformed token', () => {
    expect(tokenAssuranceLevel(tokenWith({}))).toBeNull()
    expect(tokenAssuranceLevel('not-a-token')).toBeNull()
    expect(tokenAssuranceLevel('a.%%%.c')).toBeNull()
  })
})

describe('isMissingSecondFactor', () => {
  const verified = { factors: [{ status: 'verified', factor_type: 'totp' }] }

  it('refuses a password-only token when 2FA is on', () => {
    expect(isMissingSecondFactor(verified, tokenWith({ aal: 'aal1' }))).toBe(true)
    expect(isMissingSecondFactor(verified, tokenWith({}))).toBe(true)
  })

  it('accepts a token that passed the code step', () => {
    expect(isMissingSecondFactor(verified, tokenWith({ aal: 'aal2' }))).toBe(false)
  })

  it('does not ask accounts without 2FA, or with only an unfinished enrollment', () => {
    expect(isMissingSecondFactor({}, tokenWith({ aal: 'aal1' }))).toBe(false)
    expect(isMissingSecondFactor({ factors: [] }, tokenWith({ aal: 'aal1' }))).toBe(false)
    expect(isMissingSecondFactor({ factors: [{ status: 'unverified' }] }, tokenWith({ aal: 'aal1' }))).toBe(false)
  })
})
