import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { ClassEnrollment, Document, Folder, FolderType } from '../types/index'

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

  const folders = data ?? []
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

  return {
    folder_id: folderId,
    student_id: studentId,
    enrolled_at: new Date().toISOString(),
    email: student.email,
    display_name: student.displayName,
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

/** Delete a folder for the current user. */
export async function deleteFolder(
  userId: string,
  folderId: string
): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('folder_id', folderId)
    .eq('user_id', userId)

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

  const { data, error } = await supabase
    .from('documents')
    .select(
      // Exclude `content` (can be multi-MB) — the folder view only needs metadata.
      'id,user_id,title,header_content,footer_content,show_header,show_footer,header_number_format,footer_number_format,page_size,margins,orientation,formatting_history,is_isolated,formatting_preset,is_deleted,deleted_at,share_permission,share_token,share_expires_at,created_at,updated_at'
    )
    .in('id', documentIds)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch folder documents: ${error.message}`)
  }

  return (data || []).map((row) => ({ ...row, content: '' }))
}
