import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { ClassEnrollment, Document, Folder, FolderType } from '../types/index'
import { listDocuments } from './documentModel'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Course metadata accepted when creating a class folder. */
export interface CreateFolderOptions {
  folderType?: FolderType
  classCode?: string
  academicTerm?: string
}

/**
 * Look up the email and display name of every auth user, for roster display.
 * `listUsers` returns one page at a time, so every page is walked — otherwise a
 * student past the first page looks like a non-existent account.
 */
async function getAuthDirectory(): Promise<Map<string, { email: string | null; displayName: string | null }>> {
  const directory = new Map<string, { email: string | null; displayName: string | null }>()
  const perPage = 1000
  let page = 1
  let lastPage = 1

  do {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error) break

    for (const user of data?.users || []) {
      directory.set(user.id, {
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
      })
    }

    lastPage = data?.lastPage ?? page
    page += 1
  } while (page <= lastPage)

  return directory
}

/** Ensure the requested folder is owned by the current user. */
async function requireFolder(
  userId: string,
  folderId: string
): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('Folder not found')
  }

  return data
}

/** Fetch a folder the user owns, or null (nullable variant of requireFolder). */
export async function getOwnedFolder(
  userId: string,
  folderId: string
): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

/** Ensure the requested document belongs to the current user. */
async function requireDocument(userId: string, documentId: string): Promise<void> {
  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('Document not found')
  }
}

/** True when the user owns the folder or is enrolled in its class roster. */
export async function canReadFolder(userId: string, folderId: string): Promise<boolean> {
  const { data: owned, error: ownedError } = await supabase
    .from('folders')
    .select('folder_id')
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!ownedError && owned) return true

  const { data: enrolled, error: enrolledError } = await supabase
    .from('class_enrollments')
    .select('folder_id')
    .eq('folder_id', folderId)
    .eq('student_id', userId)
    .maybeSingle()

  return !enrolledError && Boolean(enrolled)
}

/** Build a parenthesised SQL id list of the class folders the user is enrolled in. */
async function enrolledFolderIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('class_enrollments')
    .select('folder_id')
    .eq('student_id', userId)

  return (data || []).map((row) => row.folder_id)
}

/**
 * Count enrolled students and their submissions per class folder.
 * A submission is a document inside the folder owned by an enrolled student.
 */
async function getClassFolderStats(
  classFolderIds: string[]
): Promise<Map<string, { enrolled: number; submissions: number }>> {
  const stats = new Map<string, { enrolled: number; submissions: number }>()
  if (classFolderIds.length === 0) return stats

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('folder_id,student_id')
    .in('folder_id', classFolderIds)

  const studentsByFolder = new Map<string, Set<string>>()
  for (const row of enrollments || []) {
    const set = studentsByFolder.get(row.folder_id) || new Set<string>()
    set.add(row.student_id)
    studentsByFolder.set(row.folder_id, set)
  }

  const { data: links } = await supabase
    .from('folder_documents')
    .select('folder_id,document_id')
    .in('folder_id', classFolderIds)

  const documentIds = Array.from(new Set((links || []).map((row) => row.document_id)))
  let ownerByDocument = new Map<string, string>()
  if (documentIds.length > 0) {
    // Metadata only — never select `content` here (it can be multi-MB).
    const { data: docs } = await supabase
      .from('documents')
      .select('id,user_id')
      .in('id', documentIds)
    ownerByDocument = new Map((docs || []).map((doc) => [doc.id, doc.user_id]))
  }

  for (const folderId of classFolderIds) {
    const students = studentsByFolder.get(folderId) || new Set<string>()
    const submissions = (links || []).filter(
      (row) =>
        row.folder_id === folderId && students.has(ownerByDocument.get(row.document_id) ?? '')
    ).length
    stats.set(folderId, { enrolled: students.size, submissions })
  }

  return stats
}

/**
 * Fetch every top-level folder the user can see: the ones they own plus any
 * class folder they are enrolled in. Class folders carry roster and
 * submission counts so the UI can badge them without extra round-trips.
 */
export async function getFolders(userId: string): Promise<Folder[]> {
  const memberFolderIds = await enrolledFolderIds(userId)
  const filter = memberFolderIds.length
    ? `user_id.eq.${userId},folder_id.in.(${memberFolderIds.join(',')})`
    : `user_id.eq.${userId}`

  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .or(filter)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to get folders: ${error.message}`)
  }

  const folders = await backfillJoinCodes(userId, data ?? [])
  const classFolderIds = folders
    .filter((folder) => folder.folder_type === 'class')
    .map((folder) => folder.folder_id)

  if (classFolderIds.length === 0) {
    return folders
  }

  const stats = await getClassFolderStats(classFolderIds)
  return folders.map((folder) => {
    const stat = stats.get(folder.folder_id)
    return {
      ...folder,
      enrolled_count: stat?.enrolled ?? 0,
      submission_count: stat?.submissions ?? 0,
    }
  })
}

/** Fetch a single folder by id for the current user. */
export async function getFolderById(
  userId: string,
  folderId: string
): Promise<Folder> {
  return requireFolder(userId, folderId)
}

/** Create a new top-level folder for the current user. */
export async function createFolder(
  userId: string,
  name: string,
  options: CreateFolderOptions = {}
): Promise<Folder> {
  const folderType: FolderType = options.folderType === 'class' ? 'class' : 'personal'

  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: userId,
      name,
      parent_id: null,
      folder_type: folderType,
      class_code: folderType === 'class' ? options.classCode ?? null : null,
      academic_term: folderType === 'class' ? options.academicTerm ?? null : null,
      ...(folderType === 'class' ? { join_code: await generateJoinCode() } : {}),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create folder: ${error.message}`)
  }

  return { ...data, enrolled_count: 0, submission_count: 0 }
}

/** List the students enrolled in one of the current user's class folders. */
export async function getFolderEnrollments(
  userId: string,
  folderId: string
): Promise<ClassEnrollment[]> {
  const folder = await requireFolder(userId, folderId)
  if (folder.folder_type !== 'class') {
    throw new Error('Only class folders have a student roster')
  }

  const { data, error } = await supabase
    .from('class_enrollments')
    .select('folder_id,student_id,enrolled_at')
    .eq('folder_id', folderId)
    .order('enrolled_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to load class roster: ${error.message}`)
  }

  const directory = await getAuthDirectory()
  return (data || []).map((row) => ({
    ...row,
    email: directory.get(row.student_id)?.email ?? null,
    display_name: directory.get(row.student_id)?.displayName ?? null,
  }))
}

/** Enroll a student into a class folder by their Supabase Auth email. */
export async function enrollStudent(
  userId: string,
  folderId: string,
  email: string
): Promise<ClassEnrollment> {
  const folder = await requireFolder(userId, folderId)
  if (folder.folder_type !== 'class') {
    throw new Error('Only class folders have a student roster')
  }

  const directory = await getAuthDirectory()
  const match = Array.from(directory.entries()).find(
    ([, value]) => value.email?.toLowerCase() === email.toLowerCase()
  )

  if (!match) {
    throw new Error('No IntelliDocs account exists for that email address')
  }

  const [studentId, student] = match
  const { error } = await supabase
    .from('class_enrollments')
    .upsert({ folder_id: folderId, student_id: studentId }, { onConflict: 'folder_id,student_id' })

  if (error) {
    throw new Error(`Failed to enroll student: ${error.message}`)
  }

  await provisionStudentWorkspaceFolder(studentId, folder, student.displayName, student.email)

  return {
    folder_id: folderId,
    student_id: studentId,
    enrolled_at: new Date().toISOString(),
    email: student.email,
    display_name: student.displayName,
  }
}

/**
 * Ensure an enrolled student owns a personal workspace folder inside the
 * class folder (their writable coursework area). Idempotent: skips when a
 * personal folder under this class folder already exists for the student.
 */
async function provisionStudentWorkspaceFolder(
  studentId: string,
  classFolder: Folder,
  displayName: string | null,
  email: string | null = null
): Promise<void> {
  const { data: existing } = await supabase
    .from('folders')
    .select('folder_id')
    .eq('user_id', studentId)
    .eq('parent_id', classFolder.folder_id)
    .eq('folder_type', 'personal')
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await supabase.from('folders').insert({
    user_id: studentId,
    name: displayName?.trim() || email?.split('@')[0]?.trim() || 'Student Workspace',
    parent_id: classFolder.folder_id,
    folder_type: 'personal',
    class_code: null,
    academic_term: null,
  })

  if (error) {
    throw new Error(`Failed to create the student workspace folder: ${error.message}`)
  }
}

/** Remove a student from a class folder roster. */
export async function unenrollStudent(
  userId: string,
  folderId: string,
  studentId: string
): Promise<void> {
  await requireFolder(userId, folderId)

  const { error } = await supabase
    .from('class_enrollments')
    .delete()
    .eq('folder_id', folderId)
    .eq('student_id', studentId)

  if (error) {
    throw new Error(`Failed to remove student from class: ${error.message}`)
  }
}

/** Rename a folder for the current user. */
export async function renameFolder(
  userId: string,
  folderId: string,
  name: string
): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .update({ name })
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to rename folder: ${error.message}`)
  }

  return data
}

/**
 * Delete a folder.
 *
 * Authorization rules:
 * - The folder owner can delete their own folders, except when that folder is
 *   a class workspace (parent is a class folder the owner is not enrolled
 *   instructor of) — students must not remove their own class workspace.
 * - The owner of a class folder can delete workspace folders inside it
 *   (student subfolders), even though the student owns those rows.
 */
export async function deleteFolder(
  userId: string,
  folderId: string
): Promise<void> {
  const { data: folder, error: fetchError } = await supabase
    .from('folders')
    .select('*')
    .eq('folder_id', folderId)
    .maybeSingle()

  if (fetchError || !folder) {
    throw Object.assign(new Error('Folder not found'), { status: 404 })
  }

  let parent: { folder_id: string; user_id: string; folder_type?: FolderType } | null = null
  if (folder.parent_id) {
    const { data: parentRow } = await supabase
      .from('folders')
      .select('folder_id,user_id,folder_type')
      .eq('folder_id', folder.parent_id)
      .maybeSingle()
    parent = parentRow ?? null
  }

  const ownsFolder = folder.user_id === userId
  const ownsParent = parent?.user_id === userId

  if (!ownsFolder && !ownsParent) {
    throw Object.assign(new Error('Folder not found'), { status: 404 })
  }

  // A folder nested inside a class folder belongs to the class workspace —
  // only the instructor who owns the class folder may remove it.
  if (parent?.folder_type === 'class' && !ownsParent) {
    throw Object.assign(
      new Error('Students cannot delete their class workspace folder. Only the course instructor can remove it.'),
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('folder_id', folderId)

  if (error) {
    throw new Error(`Failed to delete folder: ${error.message}`)
  }
}

/** Locate the user's "My Drive" folder if it exists. */
export async function getDefaultFolder(userId: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .eq('name', 'My Drive')
    .is('parent_id', null)
    .limit(1)

  if (error) {
    throw new Error(`Failed to fetch default folder: ${error.message}`)
  }

  return data?.[0] ?? null
}

/** Return the "My Drive" folder, creating it if necessary. */
export async function getOrCreateDefaultFolder(
  userId: string
): Promise<Folder> {
  const existing = await getDefaultFolder(userId)
  if (existing) {
    return existing
  }

  return createFolder(userId, 'My Drive')
}

/** Move a document into the requested folder, replacing any prior folder link. */
export async function assignDocumentToFolder(
  userId: string,
  documentId: string,
  folderId: string
): Promise<void> {
  await requireDocument(userId, documentId)
  await requireFolder(userId, folderId)

  const { error: deleteError } = await supabase
    .from('folder_documents')
    .delete()
    .eq('document_id', documentId)

  if (deleteError) {
    throw new Error(`Failed to clear existing folder link: ${deleteError.message}`)
  }

  const { error: insertError } = await supabase
    .from('folder_documents')
    .insert({
      folder_id: folderId,
      document_id: documentId,
    })

  if (insertError) {
    throw new Error(`Failed to assign folder: ${insertError.message}`)
  }
}

/**
 * Fetch all documents currently inside a folder.
 * The owner sees everything; a student enrolled in a class folder sees the
 * folder's shared contents, which is what makes a class folder shareable.
 */
export async function getDocumentsForFolder(
  userId: string,
  folderId: string
): Promise<Document[]> {
  if (!(await canReadFolder(userId, folderId))) {
    throw new Error('Folder not found')
  }

  const { data: folderRows, error: folderError } = await supabase
    .from('folder_documents')
    .select('document_id')
    .eq('folder_id', folderId)

  if (folderError) {
    throw new Error(`Failed to read folder contents: ${folderError.message}`)
  }

  const documentIds = (folderRows ?? []).map((row) => row.document_id)

  if (documentIds.length === 0) {
    return []
  }

  // Exclude the multi-MB `content` column — the folder view only needs
  // metadata plus the lightweight preview snippet for grid cards.
  const { data, error } = await listDocuments<Omit<Document, 'content'>>((columns) =>
    supabase
      .from('documents')
      .select(columns)
      .in('id', documentIds)
      .order('updated_at', { ascending: false }),
  )

  if (error) {
    throw new Error(`Failed to fetch folder documents: ${error.message}`)
  }

  return (data || []).map((row) => ({ ...row, content: '' }))
}

/** Characters used in join codes; no 0/O/1/I so a code is easy to read aloud. */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A random 6-character join code that no class folder uses yet. */
async function generateJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = ''
    for (let i = 0; i < 6; i += 1) {
      code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
    }
    const { data } = await supabase.from('folders').select('folder_id').ilike('join_code', code).limit(1)
    if (!data || data.length === 0) return code
  }
  throw new Error('Could not generate a unique class join code')
}

/**
 * Give the owner's class folders a join code when they have none (classes made
 * before join codes existed) and hide the code from everyone but the owner.
 */
async function backfillJoinCodes(userId: string, folders: Folder[]): Promise<Folder[]> {
  const result: Folder[] = []
  for (const folder of folders) {
    if (folder.folder_type !== 'class') {
      result.push(folder)
    } else if (folder.user_id !== userId) {
      result.push({ ...folder, join_code: null })
    } else if (folder.join_code) {
      result.push(folder)
    } else {
      const joinCode = await generateJoinCode()
      await supabase.from('folders').update({ join_code: joinCode }).eq('folder_id', folder.folder_id)
      result.push({ ...folder, join_code: joinCode })
    }
  }
  return result
}

/** Replace a class folder's join code with a new one (owner only). */
export async function regenerateJoinCode(userId: string, folderId: string): Promise<Folder> {
  const folder = await requireFolder(userId, folderId)
  if (folder.folder_type !== 'class') {
    throw Object.assign(new Error('Only class folders have a join code'), { status: 400 })
  }
  const joinCode = await generateJoinCode()
  const { data, error } = await supabase
    .from('folders')
    .update({ join_code: joinCode })
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new Error(`Failed to regenerate join code: ${error.message}`)
  return { ...data, enrolled_count: folder.enrolled_count, submission_count: folder.submission_count }
}

/**
 * Enroll the caller into the class that owns this join code and make sure they
 * have their workspace folder. Safe to call again: an enrolled student gets
 * the same class back.
 */
export async function joinClassByCode(userId: string, rawCode: string): Promise<{ classFolder: Folder; alreadyEnrolled: boolean }> {
  const code = rawCode.trim()
  const { data: found } = await supabase
    .from('folders')
    .select('*')
    .eq('folder_type', 'class')
    .ilike('join_code', code)
    .limit(1)
    .maybeSingle()

  if (!found) {
    throw Object.assign(new Error('No class matches that code'), { status: 404 })
  }
  if (found.user_id === userId) {
    throw Object.assign(new Error('This is your own class'), { status: 400 })
  }

  const { data: existing } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('folder_id', found.folder_id)
    .eq('student_id', userId)
    .maybeSingle()

  if (!existing) {
    const { error } = await supabase
      .from('class_enrollments')
      .insert({ folder_id: found.folder_id, student_id: userId })
    if (error) throw new Error(`Failed to join class: ${error.message}`)
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const displayName = (authUser?.user?.user_metadata?.display_name as string | undefined) ?? null
  await provisionStudentWorkspaceFolder(userId, found, displayName, authUser?.user?.email ?? null)

  return { classFolder: { ...found, join_code: null }, alreadyEnrolled: Boolean(existing) }
}
