/** The login-assurance level named in a Supabase access token ('aal1' = password, 'aal2' = password + 2FA code). */
export function tokenAssuranceLevel(token: string): string | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : null
  } catch {
    return null
  }
}

/** A user as returned by Supabase, reduced to the part the 2FA check reads. */
interface UserWithFactors {
  factors?: Array<{ status?: string; factor_type?: string }> | null
}

/**
 * True when a request must be refused because the account has 2FA switched on
 * but the token only proves the password (no authenticator code yet).
 */
export function isMissingSecondFactor(user: UserWithFactors, token: string): boolean {
  const hasVerifiedFactor = (user.factors ?? []).some((factor) => factor.status === 'verified')
  return hasVerifiedFactor && tokenAssuranceLevel(token) !== 'aal2'
}
