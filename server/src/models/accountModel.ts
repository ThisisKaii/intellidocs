import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { getStringListSetting } from './personalizationModel'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

/** An error with the HTTP status the controller should answer with. */
function failure(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

/** Everything a user can download about their own account. */
export interface AccountExport {
  exported_at: string
  account: { id: string; email: string | null; display_name: string | null; role: string }
  documents: Array<Record<string, unknown>>
  folders: Array<Record<string, unknown>>
  custom_dictionary: string[]
  ignored_patterns: string[]
  editor_preferences: Record<string, unknown> | null
}

/** True when the account signs in with an email and password (not only Google). */
function hasPasswordLogin(providers: unknown): boolean {
  return Array.isArray(providers) && providers.includes('email')
}

/**
 * Change a user's password. Accounts that sign in with a password must prove
 * they know the current one; Google-only accounts are setting their first
 * password, so there is nothing to prove. When the caller's session token is given, every
 * other signed-in device is signed out afterwards (this session stays), so a stolen old
 * password stops working everywhere.
 */
export async function changePassword(
  userId: string,
  email: string,
  currentPassword: string | undefined,
  newPassword: string,
  accessToken?: string,
): Promise<void> {
  const { data: found, error: lookupError } = await supabase.auth.admin.getUserById(userId)
  if (lookupError || !found?.user) throw failure(404, 'Account not found')

  if (hasPasswordLogin(found.user.app_metadata?.providers)) {
    if (!currentPassword) throw failure(400, 'Enter your current password')
    if (currentPassword === newPassword) throw failure(400, 'Choose a new password that is different from the current one')
    const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (error) throw failure(400, 'Your current password is not correct')
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw failure(400, error.message)

  if (accessToken) {
    try {
      await supabase.auth.admin.signOut(accessToken, 'others')
    } catch {
      // The password is already changed; failing to end other sessions must not undo that.
    }
  }
}

/** Read a user's editor preferences (null when they never saved any). */
export async function getEditorPreferences(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('personalization_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'editor_preferences')
    .maybeSingle()
  if (error) throw new Error(`Failed to read editor preferences: ${error.message}`)
  const value = data?.value
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Save a user's editor preferences, replacing the stored copy. */
export async function setEditorPreferences(userId: string, value: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('personalization_settings')
    .upsert({ user_id: userId, key: 'editor_preferences', value }, { onConflict: 'user_id,key' })
  if (error) throw new Error(`Failed to save editor preferences: ${error.message}`)
}

/** Gather the user's profile, documents, folders and preferences into one downloadable object. */
export async function exportAccountData(userId: string, email: string): Promise<AccountExport> {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  const documentColumns = 'id,title,content,formatting_preset,is_deleted,created_at,updated_at'
  /** Read the user's documents with the given column list. */
  const readDocuments = async (columns: string): Promise<{ data: unknown[] | null; error: { message: string } | null }> =>
    supabase.from('documents').select(columns).eq('user_id', userId)

  let documents = await readDocuments(`${documentColumns},citation_data`)
  if (documents.error) {
    // Migration 029 (citation_data) may not be applied yet.
    documents = await readDocuments(documentColumns)
  }
  if (documents.error) throw new Error(`Failed to export documents: ${documents.error.message}`)

  const folders = await supabase
    .from('folders')
    .select('folder_id,name,parent_id,folder_type,class_code,academic_term,created_at')
    .eq('user_id', userId)
  if (folders.error) throw new Error(`Failed to export folders: ${folders.error.message}`)

  const [dictionary, ignored, preferences] = await Promise.all([
    getStringListSetting(userId, 'custom_dictionary'),
    getStringListSetting(userId, 'ignored_patterns'),
    getEditorPreferences(userId).catch(() => null),
  ])

  return {
    exported_at: new Date().toISOString(),
    account: {
      id: userId,
      email,
      display_name: (authUser?.user?.user_metadata?.display_name as string | undefined) ?? null,
      role: ((profile?.roles as { role_name?: string } | null)?.role_name) ?? 'student',
    },
    documents: (documents.data ?? []) as Array<Record<string, unknown>>,
    folders: (folders.data ?? []) as Array<Record<string, unknown>>,
    custom_dictionary: dictionary,
    ignored_patterns: ignored,
    editor_preferences: preferences,
  }
}

/** Remove every image the user uploaded to the document-images bucket. */
async function deleteUserImages(userId: string): Promise<void> {
  const bucket = supabase.storage.from('document-images')
  const { data } = await bucket.list(userId, { limit: 1000 })
  const paths = (data ?? []).map((object) => `${userId}/${object.name}`)
  if (paths.length > 0) await bucket.remove(paths)
}

/**
 * Permanently delete an account and its data. The email must be typed exactly
 * as a confirmation, and the last administrator can't be deleted.
 */
export async function deleteAccount(userId: string, email: string, confirmEmail: string): Promise<void> {
  if (confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw failure(400, 'The email you typed does not match this account')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles(role_name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (((profile?.roles as { role_name?: string } | null)?.role_name) === 'admin') {
    const { count } = await supabase
      .from('user_profiles')
      .select('roles!inner(role_name)', { count: 'exact', head: true })
      .eq('roles.role_name', 'admin')
    if ((count ?? 0) <= 1) throw failure(400, 'You are the last administrator. Make another admin first.')
  }

  await deleteUserImages(userId).catch((error: unknown) => {
    console.error('Account deletion: image cleanup failed:', error instanceof Error ? error.message : error)
  })

  // Rows that reference the user cascade when the auth user is deleted; these
  // are removed first so a missing cascade can never leave documents behind.
  for (const table of ['documents', 'folders', 'personalization_settings', 'user_profiles']) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) console.error(`Account deletion: could not clear ${table}:`, error.message)
  }

  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Failed to delete the account: ${error.message}`)
}
