import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Plan, RoleName, StorageSummary, VerificationStatus } from '../types/index'
import { effectivePlan, PlanRow } from '../utils/plan'
import { namesMetadata, readAccountNames, type AccountNames } from '../utils/accountNames'
import type { User } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * Storage quota per role in bytes, sized so a class of free-tier testers fits in
 * the 500 MB database with room for versions and analytics. New accounts start as
 * `user`; academic verification (student, professor) and admin raise the cap.
 * Pro subscribers have no cap (see getUserStorageSummary).
 */
export const STORAGE_QUOTA_BYTES: Record<RoleName, number> = {
  user: 10 * 1024 * 1024,
  student: 25 * 1024 * 1024,
  professor: 50 * 1024 * 1024,
  admin: 100 * 1024 * 1024,
}

/**
 * Create an email/password account with the person's names in Auth metadata
 * (first_name, last_name and display_name; never user_profiles).
 */
export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<{ user: User | null; error: string | null }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: namesMetadata(firstName, lastName) },
  })
  return { user: data.user ?? null, error: error?.message ?? null }
}

/** A user's names as stored in Auth metadata (Google's fields as fallback). */
export async function getOwnNames(userId: string): Promise<AccountNames> {
  const { data } = await supabase.auth.admin.getUserById(userId)
  return readAccountNames(data?.user?.user_metadata)
}

/**
 * Update a user's own names in Supabase Auth's user_metadata
 * (auth.users.raw_user_meta_data) and return the fresh values. Either first and
 * last name together, or a single display name (older clients).
 */
export async function updateOwnProfile(
  userId: string,
  names: { firstName: string; lastName: string } | { displayName: string },
): Promise<AccountNames | null> {
  const { data: existing } = await supabase.auth.admin.getUserById(userId)
  const metadata = {
    ...(existing?.user?.user_metadata ?? {}),
    ...('displayName' in names ? { display_name: names.displayName } : namesMetadata(names.firstName, names.lastName)),
  }
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  })
  if (error || !data.user) return null
  return readAccountNames(data.user.user_metadata)
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

  const role = ((profile?.roles as { role_name?: RoleName } | null)?.role_name) ?? 'user'
  const plan = effectivePlan(await getPlanRow(userId))

  let usedBytes = 0
  try {
    // Summed inside the database (migration 027): never download document content for this.
    const { data, error } = await supabase.rpc('user_storage_bytes', { p_user_id: userId })
    if (error) throw new Error(`Failed to load user storage: ${error.message}`)
    usedBytes = Number(data ?? 0)
  } catch (e) {
    console.error('Storage summary size query failed (degrading to 0; is migration 027 applied?):', e)
  }

  return { usedBytes, quotaBytes: plan === 'pro' ? null : STORAGE_QUOTA_BYTES[role], role, plan }
}

/**
 * The user's plan columns, or null. Read on its own so a database without migration 040
 * still reports the user's role and quota (as a free plan).
 */
export async function getPlanRow(userId: string): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('plan, plan_started_at, plan_renews_at, plan_canceled_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return null
  return (data as PlanRow | null) ?? null
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
  /** Effective subscription plan (mock Pro, migration 040). */
  plan: Plan
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
    role: ((profile?.roles as { role_name?: RoleName } | null)?.role_name) ?? 'user',
    verificationStatus:
      (profile?.verification_status as VerificationStatus | undefined) ?? 'approved',
    plan: effectivePlan(await getPlanRow(userId)),
  }
}

/**
 * Create the profile row for a new account with the baseline `user` role. Never touches an
 * existing row, so signing in again can't reset a verified student or professor. Falls back to
 * `student` on a database without migration 039 (no `user` role yet).
 */
export async function ensureUserProfile(userId: string): Promise<void> {
  const roleId = (await roleIdByName('user')) ?? (await roleIdByName('student'))
  if (!roleId) return
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId, role_id: roleId, verification_status: 'approved' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  if (error) console.error('ensureUserProfile failed:', error.message)
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

/** Roles an academic application can never "upgrade" from, per requested role. */
const ALREADY_HAS: Record<'student' | 'professor', RoleName[]> = {
  student: ['student', 'professor', 'admin'],
  professor: ['professor', 'admin'],
}

/**
 * Mark a profile as having a pending academic application. The user keeps their current role
 * (and quota) while pending; only an admin approval grants the requested role.
 * Returns 'already' when the user already holds that role or a higher one.
 */
async function markApplicationPending(
  userId: string,
  requestedRole: 'student' | 'professor',
  idFields: Record<string, string>,
): Promise<'pending' | 'already'> {
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('verification_status, roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  const currentRole = (existing?.roles as { role_name?: RoleName } | null)?.role_name
  const approved = existing?.verification_status === 'approved'
  if (currentRole === 'admin' || (currentRole && approved && ALREADY_HAS[requestedRole].includes(currentRole))) {
    return 'already'
  }

  const fields = {
    verification_status: 'pending',
    requested_role: requestedRole,
    ...idFields,
    decision_note: null,
    decided_at: null,
    decided_by: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('user_profiles').update(fields).eq('user_id', userId)
    if (error) throw new Error(error.message)
  } else {
    const baseRole = (await roleIdByName('user')) ?? (await roleIdByName('student'))
    if (!baseRole) throw new Error('Baseline role not found in system')
    const { error } = await supabase.from('user_profiles').insert({ user_id: userId, role_id: baseRole, ...fields })
    if (error) throw new Error(error.message)
  }
  return 'pending'
}

/** Details a user submits when applying for verified student status. */
export interface StudentApplicationInput {
  email: string | null
  studentId: string
  college: string
  degreeProgram: string
}

/**
 * Record a student application. The user stays on the baseline role (and quota) until an admin
 * approves it. Returns 'already' when the user is already a verified student or higher.
 */
export async function createStudentApplication(
  userId: string,
  input: StudentApplicationInput,
): Promise<'submitted' | 'already'> {
  const outcome = await markApplicationPending(userId, 'student', { student_id: input.studentId })
  if (outcome === 'already') return 'already'

  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'student_application',
    title: 'Student Application Submitted',
    message: `Application submitted by ${input.email ?? 'a user'}. College: ${input.college}, Degree Program: ${input.degreeProgram}, Student ID: ${input.studentId}`,
    metadata: {
      studentId: input.studentId,
      college: input.college,
      degreeProgram: input.degreeProgram,
      submittedAt: new Date().toISOString(),
    },
  })
  if (notifError) throw new Error(notifError.message)

  await notifyAdminsOfApplication(userId, input.email, 'student')
  return 'submitted'
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
  const outcome = await markApplicationPending(userId, 'professor', { faculty_id: input.facultyId })
  if (outcome === 'already') return 'already'

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

  await notifyAdminsOfApplication(userId, input.email, 'professor')
  return 'submitted'
}

/** Tell every admin that a new academic application is waiting. Best effort. */
async function notifyAdminsOfApplication(
  applicantId: string,
  email: string | null,
  requestedRole: 'student' | 'professor',
): Promise<void> {
  const adminRole = await roleIdByName('admin')
  if (!adminRole) return
  const { data: admins } = await supabase.from('user_profiles').select('user_id').eq('role_id', adminRole)
  const rows = (admins ?? []).map((admin) => ({
    user_id: admin.user_id,
    type: `${requestedRole}_application_review`,
    title: `New ${requestedRole} application`,
    message: `${email ?? 'A user'} applied for ${requestedRole} access and is waiting for review.`,
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
    // A null quota is unlimited (Pro).
    if (summary && summary.quotaBytes !== null && summary.usedBytes + addedBytes > summary.quotaBytes) throw storageQuotaError()
    // Count this save in the cached size, so a quick run of saves can't all pass on a stale reading.
    if (summary) quotaCache.set(userId, { at: cached?.at ?? Date.now(), summary: { ...summary, usedBytes: summary.usedBytes + addedBytes } })
  } catch (error) {
    if ((error as { code?: string }).code === 'storage_quota_exceeded') throw error
    console.error('Storage quota check failed (allowing the save):', error)
  }
}
