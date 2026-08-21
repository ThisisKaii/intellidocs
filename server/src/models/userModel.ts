import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * Update a user's own display name in Supabase Auth's user_metadata
 * (auth.users.raw_user_meta_data) and return the fresh value.
 */
export async function updateOwnProfile(
  userId: string,
  displayName: string,
): Promise<string | null> {
  const { data: existing } = await supabase.auth.admin.getUserById(userId)
  const metadata = {
    ...(existing?.user?.user_metadata ?? {}),
    display_name: displayName,
  }
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  })
  if (error || !data.user) return null
  return data.user.user_metadata?.display_name ?? null
}
