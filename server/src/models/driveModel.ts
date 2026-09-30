import 'dotenv/config'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Shape of a stored Google OAuth2 token row. */
export interface GoogleToken {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  expiry_date: number
  created_at: string
  updated_at: string
}

/** Upsert Google tokens for a user (insert or update on conflict). */
export async function upsertGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
): Promise<void> {
  const { error } = await supabase
    .from('google_tokens')
    .upsert(
      {
        user_id: userId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: expiryDate,
      },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(`Failed to upsert google tokens: ${error.message}`)
}

/** Retrieve the stored Google tokens for a user. */
export async function getGoogleTokens(userId: string): Promise<GoogleToken | null> {
  const { data, error } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // no row found
    throw new Error(`Failed to get google tokens: ${error.message}`)
  }

  return data
}

/** Delete Google tokens for a user (disconnect). */
export async function deleteGoogleTokens(userId: string): Promise<void> {
  const { error } = await supabase
    .from('google_tokens')
    .delete()
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete google tokens: ${error.message}`)
}

/**
 * Build an OAuth2 client from the stored token pair.
 *
 * When Google rotates the access token the `tokens` event fires, and the new
 * pair is written back to Supabase so the session survives rotation. Without
 * this the refresh token would still work but the stored access token would
 * drift out of date.
 */
function buildClientFromTokens(
  userId: string,
  tokens: GoogleToken
): InstanceType<typeof google.auth.OAuth2> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })

  oauth2.on('tokens', (newTokens) => {
    if (!newTokens.refresh_token && !newTokens.access_token) return
    void upsertGoogleTokens(
      userId,
      newTokens.access_token ?? tokens.access_token,
      newTokens.refresh_token ?? tokens.refresh_token,
      newTokens.expiry_date ?? 0
    ).catch((error: unknown) => {
      console.error('Failed to persist refreshed Google tokens:', error)
    })
  })

  return oauth2
}

/**
 * Link a Google provider token to a user, but only when they do not already
 * have one.
 *
 * A token captured during sign-in must never clobber a token the user granted
 * deliberately through the Drive consent flow: that flow can request a narrower
 * scope set, and silently replacing it would either widen or narrow access
 * without the user choosing. Existing connections are reported as such.
 */
export async function linkProviderTokenIfAbsent(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiryDate: number
): Promise<{ linked: boolean; reason: string }> {
  const existing = await getGoogleTokens(userId)
  if (existing) {
    return { linked: false, reason: 'A Google Drive connection already exists for this account.' }
  }

  await upsertGoogleTokens(userId, accessToken, refreshToken, expiryDate)
  return { linked: true, reason: 'Google Drive linked from your Google sign-in.' }
}

/**
 * Return an authenticated Google Drive client for a user.
 * Throws when the user has not connected Drive, so callers can surface a
 * reconnect prompt rather than a generic 500.
 */
export async function getDriveClient(
  userId: string
): Promise<ReturnType<typeof google.drive>> {
  const tokens = await getGoogleTokens(userId)
  if (!tokens) throw new Error('Google Drive not connected')
  return google.drive({ version: 'v3', auth: buildClientFromTokens(userId, tokens) })
}
