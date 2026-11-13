/**
 * Linking a Google account from Settings leaves the app for Google and comes back through
 * /auth/callback, the same page as a Google sign-in. This marker tells the callback that the
 * round trip was a link, so it returns to Settings and reports the outcome there.
 */
const LINKING_KEY = 'intellidocs:linkingGoogle'

/** Scopes asked for when linking, so the link also connects Google Drive (no second sign-in). */
export const GOOGLE_LINK_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'

/** A link abandoned at Google's screen must not turn a later sign-in in this tab into a "link". */
const LINKING_TTL_MS = 10 * 60 * 1000

export function markGoogleLinking(): void {
  try { sessionStorage.setItem(LINKING_KEY, String(Date.now())) } catch { /* storage blocked: falls back to a normal callback */ }
}

/**
 * True if a link was started in this tab in the last few minutes. Only reads the marker:
 * StrictMode runs the callback effect twice, so clearing here would lose it on the second run.
 */
export function isGoogleLinking(): boolean {
  try {
    const started = Number(sessionStorage.getItem(LINKING_KEY))
    return started > 0 && Date.now() - started < LINKING_TTL_MS
  } catch {
    return false
  }
}

export function clearGoogleLinking(): void {
  try { sessionStorage.removeItem(LINKING_KEY) } catch { /* nothing stored */ }
}

/** An OAuth error Supabase put on the callback URL (query for PKCE, hash for implicit flow). */
export function readCallbackError(location: { search: string; hash: string }): { code: string; description: string } | null {
  for (const raw of [location.search, location.hash.replace(/^#/, '')]) {
    const params = new URLSearchParams(raw)
    const error = params.get('error')
    if (error) {
      return { code: params.get('error_code') ?? error, description: params.get('error_description') ?? error }
    }
  }
  return null
}

/** Turn a Supabase identity-linking error into text a user can act on. */
export function linkErrorMessage(code: string | undefined, fallback: string): string {
  if (code === 'manual_linking_disabled' || /manual linking is disabled/i.test(fallback)) {
    return 'Google linking is turned off for this project. Ask an administrator to allow manual account linking.'
  }
  if (code === 'identity_already_exists' || /already linked|already exists/i.test(fallback)) {
    return 'That Google account is already used by another IntelliDocs account. Sign in with a different Google account, or delete the other IntelliDocs account first.'
  }
  return `Failed to link Google account: ${fallback}`
}
