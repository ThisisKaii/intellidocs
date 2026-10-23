import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { RoleName, StorageSummary, VerificationStatus } from '../types/index'

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
 * Read the stored size of a user's active (non-trashed) documents from the
 * `user_storage_bytes` database function and resolve the account quota from
 * their role. Returns null if the profile is missing.
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
    // Summed inside the database (migration 027): never download document content for this.
    const { data, error } = await supabase.rpc('user_storage_bytes', { p_user_id: userId })
    if (error) throw new Error(`Failed to load user storage: ${error.message}`)
    usedBytes = Number(data ?? 0)
  } catch (e) {
    console.error('Storage summary size query failed (degrading to 0; is migration 027 applied?):', e)
  }

  return { usedBytes, quotaBytes: STORAGE_QUOTA_BYTES[role], role }
}

/** A user's current role and verification status, read fresh from the database. */
export interface RoleStatus {
  role: RoleName
  verificationStatus: VerificationStatus
}

/**
 * Read a user's role and verification status directly from the database.
 *
 * The client snapshots both values at login, so an administrator approving a
 * professor or student application is invisible to the UI until the user signs
 * in again. Reading them on demand lets the client converge immediately.
 *
 * A missing profile row falls back to the same defaults the login handler
 * uses, so this never fails for a user who has just registered.
 */
export async function getOwnRoleStatus(userId: string): Promise<RoleStatus> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('verification_status, roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    role: ((profile?.roles as { role_name?: RoleName } | null)?.role_name) ?? 'student',
    verificationStatus:
      (profile?.verification_status as VerificationStatus | undefined) ?? 'approved',
  }
}
