import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { RoleName, StorageSummary } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * Storage quota per role in bytes. Verified/qualified accounts (professor,
 * admin) get a higher cap than default student accounts.
 */
const STORAGE_QUOTA_BYTES: Record<RoleName, number> = {
  student: 500 * 1024 * 1024,
  professor: 1024 * 1024 * 1024,
  admin: 1024 * 1024 * 1024,
}

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

/**
 * Sum the byte size of a user's active (non-trashed) documents and resolve
 * the account quota from their role. Returns null if the profile is missing.
 * If the size query fails (e.g. a very large document exceeds Supabase's
 * statement timeout), the quota is still returned with usedBytes = 0 so the
 * sidebar card never turns a data miss into a 500.
 */
export async function getUserStorageSummary(userId: string): Promise<StorageSummary | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  const role = ((profile?.roles as { role_name?: RoleName } | null)?.role_name) ?? 'student'

  let usedBytes = 0
  try {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('content')
      .eq('user_id', userId)
      .eq('is_deleted', false)

    if (error) throw new Error(`Failed to load user storage: ${error.message}`)

    usedBytes = (docs ?? []).reduce(
      (total, doc) => total + Buffer.byteLength(doc.content ?? '', 'utf8'),
      0,
    )
  } catch (e) {
    console.error('Storage summary size query failed (degrading to 0):', e)
  }

  return { usedBytes, quotaBytes: STORAGE_QUOTA_BYTES[role], role }
}
