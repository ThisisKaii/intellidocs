import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Document, Folder } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Ensure the requested folder belongs to the current user. */
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

/** Fetch the user's top-level folders. */
export async function getFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to get folders: ${error.message}`)
  }

  return data ?? []
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
  name: string
): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: userId,
      name,
      parent_id: null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create folder: ${error.message}`)
  }

  return data
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

/** Fetch all documents currently inside a folder. */
export async function getDocumentsForFolder(
  userId: string,
  folderId: string
): Promise<Document[]> {
  await requireFolder(userId, folderId)

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
    .select('*')
    .eq('user_id', userId)
    .in('id', documentIds)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch folder documents: ${error.message}`)
  }

  return data ?? []
}
