import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { RoleName, StorageSummary, VerificationStatus } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * Storage quota per role in bytes, sized so a class of free-tier testers fits in
 * the 500 MB database with room for versions and analytics. Verified accounts
 * (professor, admin) get a higher cap than default student accounts.
 */
export const STORAGE_QUOTA_BYTES: Record<RoleName, number> = {
  student: 25 * 1024 * 1024,
  professor: 50 * 1024 * 1024,
  admin: 100 * 1024 * 1024,
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
 * Store (or clear, with null) the link to a user's profile photo in Supabase Auth's
 * user_metadata, next to the display name. Returns false if Supabase refused the update.
 */
export async function setOwnAvatarUrl(userId: string, avatarUrl: string | null): Promise<boolean> {
  const { data: existing } = await supabase.auth.admin.getUserById(userId)
  const metadata = { ...(existing?.user?.user_metadata ?? {}), avatar_url: avatarUrl }
  const { error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: metadata })
  return !error
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

/**
 * The role a user applied for, or null. Read on its own so a database that has
 * not had migration 030 yet still reports the user's real role and status.
 */
export async function getRequestedRole(userId: string): Promise<RoleName | null> {
  const { data, error } = await supabase.from('user_profiles').select('requested_role').eq('user_id', userId).maybeSingle()
  if (error) return null
  return (data?.requested_role as RoleName | null | undefined) ?? null
}

/** A user's current role and verification status, read fresh from the database. */
export interface RoleStatus {
  role: RoleName
  verificationStatus: VerificationStatus
  /** The role the user applied for; stays set after a rejection so the UI can say which application it was. */
  requestedRole: RoleName | null
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
    requestedRole: await getRequestedRole(userId),
    role: ((profile?.roles as { role_name?: RoleName } | null)?.role_name) ?? 'student',
    verificationStatus:
      (profile?.verification_status as VerificationStatus | undefined) ?? 'approved',
  }
}

/** Details a user submits when applying to become a professor. */
export interface ProfessorApplicationInput {
  email: string | null
  college: string
  department: string
  institutionalEmail: string
  facultyId: string
  reason: string
}

/** The user's application state as shown on their settings page. */
export interface ApplicationStatus {
  requestedRole: string | null
  verificationStatus: VerificationStatus
  decisionNote: string | null
  decidedAt: string | null
}

/** Look up a role id by name, or null when the role does not exist. */
async function roleIdByName(roleName: RoleName): Promise<number | null> {
  const { data } = await supabase.from('roles').select('role_id').eq('role_name', roleName).maybeSingle()
  return data?.role_id ?? null
}

/**
 * Record a professor application. The user keeps their current role while the
 * application is pending; the admin's approval is what grants professor access.
 * Returns 'already' when the user is already an approved professor or admin.
 */
export async function createProfessorApplication(
  userId: string,
  input: ProfessorApplicationInput,
): Promise<'submitted' | 'already'> {
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('verification_status, roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  const currentRole = (existing?.roles as { role_name?: string } | null)?.role_name
  if (currentRole === 'admin' || (currentRole === 'professor' && existing?.verification_status === 'approved')) {
    return 'already'
  }

  const fields = {
    verification_status: 'pending',
    requested_role: 'professor',
    faculty_id: input.facultyId,
    decision_note: null,
    decided_at: null,
    decided_by: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('user_profiles').update(fields).eq('user_id', userId)
    if (error) throw new Error(error.message)
  } else {
    const studentRole = await roleIdByName('student')
    if (!studentRole) throw new Error('Student role not found in system')
    const { error } = await supabase.from('user_profiles').insert({ user_id: userId, role_id: studentRole, ...fields })
    if (error) throw new Error(error.message)
  }

  // The applicant's own notification carries the details the admin queue shows.
  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'professor_application',
    title: 'Professor Application Submitted',
    message: `Application submitted by ${input.email ?? 'a user'}. College: ${input.college}, Department: ${input.department}, Faculty ID: ${input.facultyId}. Reason: ${input.reason}`,
    metadata: {
      college: input.college,
      department: input.department,
      institutionalEmail: input.institutionalEmail,
      facultyId: input.facultyId,
      reason: input.reason,
      submittedAt: new Date().toISOString(),
    },
  })
  if (notifError) throw new Error(notifError.message)

  await notifyAdminsOfApplication(userId, input.email)
  return 'submitted'
}

/** Tell every admin that a new professor application is waiting. Best effort. */
async function notifyAdminsOfApplication(applicantId: string, email: string | null): Promise<void> {
  const adminRole = await roleIdByName('admin')
  if (!adminRole) return
  const { data: admins } = await supabase.from('user_profiles').select('user_id').eq('role_id', adminRole)
  const rows = (admins ?? []).map((admin) => ({
    user_id: admin.user_id,
    type: 'professor_application_review',
    title: 'New professor application',
    message: `${email ?? 'A user'} applied for professor access and is waiting for review.`,
    metadata: { applicantId },
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('notifyAdminsOfApplication failed:', error.message)
}

/** The caller's latest application state, for the settings page. */
export async function getOwnApplicationStatus(userId: string): Promise<ApplicationStatus> {
  const { data } = await supabase
    .from('user_profiles')
    .select('requested_role, verification_status, decision_note, decided_at')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    requestedRole: data?.requested_role ?? null,
    verificationStatus: (data?.verification_status as VerificationStatus | undefined) ?? 'approved',
    decisionNote: data?.decision_note ?? null,
    decidedAt: data?.decided_at ?? null,
  }
}

/** Give a user the admin role and an approved status (used by the make-admin script). */
export async function promoteToAdmin(userId: string): Promise<void> {
  const adminRole = await roleIdByName('admin')
  if (!adminRole) throw new Error('Admin role not found in system')
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, role_id: adminRole, verification_status: 'approved' }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

/** Find a user's id by email, or null when no such account exists. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  return match?.id ?? null
}

/** How long a user's storage summary is reused, so frequent autosaves don't each run the size query. */
const QUOTA_CACHE_MS = 30_000
const quotaCache = new Map<string, { at: number; summary: StorageSummary }>()

/** Forget a user's cached storage summary (after a delete or an emptied trash frees space). */
export function clearStorageCache(userId: string): void {
  quotaCache.delete(userId)
}

/**
 * Error thrown when a save would push an account over its storage quota.
 * Carries status 413 and a code the editor uses to show the "storage full" notice.
 */
export function storageQuotaError(): Error & { status: number; code: string } {
  return Object.assign(new Error('Storage full. Delete documents or empty the trash to keep saving.'), {
    status: 413,
    code: 'storage_quota_exceeded',
  })
}

/**
 * Throw a 413 when adding `addedBytes` of content would exceed the user's quota.
 * A save that shrinks or keeps the size (addedBytes <= 0) is always allowed, and
 * so is any save when the size can't be read: a broken size query must never
 * stop someone from saving their work.
 */
export async function assertWithinStorageQuota(userId: string, addedBytes: number): Promise<void> {
  if (addedBytes <= 0) return
  try {
    const cached = quotaCache.get(userId)
    let summary = cached && Date.now() - cached.at < QUOTA_CACHE_MS ? cached.summary : null
    if (!summary) {
      summary = await getUserStorageSummary(userId)
      if (summary) quotaCache.set(userId, { at: Date.now(), summary })
    }
    if (summary && summary.usedBytes + addedBytes > summary.quotaBytes) throw storageQuotaError()
    // Count this save in the cached size, so a quick run of saves can't all pass on a stale reading.
    if (summary) quotaCache.set(userId, { at: cached?.at ?? Date.now(), summary: { ...summary, usedBytes: summary.usedBytes + addedBytes } })
  } catch (error) {
    if ((error as { code?: string }).code === 'storage_quota_exceeded') throw error
    console.error('Storage quota check failed (allowing the save):', error)
  }
}
