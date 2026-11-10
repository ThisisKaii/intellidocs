/**
 * First and last names live in Supabase Auth user_metadata (never user_profiles):
 * `first_name`, `last_name` and the combined `display_name`. Google accounts carry
 * `given_name` / `family_name` / `full_name` instead until the user confirms them.
 */

export interface AccountNames {
  firstName: string | null
  lastName: string | null
  displayName: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/** Read a user's names from Auth metadata, falling back to Google's fields. */
export function readAccountNames(metadata: Record<string, unknown> | null | undefined): AccountNames {
  const meta = metadata ?? {}
  const firstName = text(meta.first_name) ?? text(meta.given_name)
  const lastName = text(meta.last_name) ?? text(meta.family_name)
  const joined = [firstName, lastName].filter(Boolean).join(' ')
  const displayName = text(meta.display_name) ?? text(meta.full_name) ?? text(meta.name) ?? (joined || null)
  return { firstName, lastName, displayName }
}

/** The metadata keys to store for a confirmed first and last name. */
export function namesMetadata(firstName: string, lastName: string): { first_name: string; last_name: string; display_name: string } {
  const first = firstName.trim()
  const last = lastName.trim()
  return { first_name: first, last_name: last, display_name: `${first} ${last}`.trim() }
}
