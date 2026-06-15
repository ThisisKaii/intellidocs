import 'dotenv/config'
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
