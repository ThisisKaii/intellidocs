import { supabase, listDocuments } from './documentModel'
import { Document } from '../types/index'

/** Postgres / PostgREST codes for a missing table (migration 042 not applied yet). */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

/** Thrown when the document_pins table does not exist yet, so callers can say so plainly. */
export class PinsUnavailableError extends Error {
  constructor() {
    super('Pinned is not available until migration 042 is applied')
    this.name = 'PinsUnavailableError'
  }
}

/** True when the error means the document_pins table is missing. */
function isMissingTable(error: { code?: string } | null): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.includes(error.code))
}

/** Pin a document for this user only (pinning it again keeps it). The caller checks access first. */
export async function pinDocument(userId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('document_pins')
    .upsert({ user_id: userId, document_id: documentId }, { onConflict: 'user_id,document_id', ignoreDuplicates: true })
  if (isMissingTable(error)) throw new PinsUnavailableError()
  if (error) throw new Error(`Failed to pin document: ${error.message}`)
}

/** Remove this user's pin; other users' pins on the same document stay. */
export async function unpinDocument(userId: string, documentId: string): Promise<void> {
  const { error } = await supabase.from('document_pins').delete().eq('user_id', userId).eq('document_id', documentId)
  if (isMissingTable(error)) throw new PinsUnavailableError()
  if (error) throw new Error(`Failed to unpin document: ${error.message}`)
}

/** Row shape of a document_pins join: the pin time plus the embedded document. */
interface PinRow {
  pinned_at: string
  documents: Omit<Document, 'content'> | null
}

/** Ids among `documentIds` that `userId` holds an active share on. */
async function sharedWith(userId: string, documentIds: string[]): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('document_shares')
    .select('document_id')
    .eq('shared_with', userId)
    .in('document_id', documentIds)
  if (error) throw new Error(`Failed to check shared documents: ${error.message}`)
  return new Set((data ?? []).map((row: { document_id: string }) => row.document_id))
}

/**
 * The user's pinned documents, most recently pinned first. Trashed documents and
 * documents the user can no longer read (a share that was removed) are left out.
 */
export async function listPinnedDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await listDocuments<PinRow>((columns) =>
    supabase
      .from('document_pins')
      .select(`pinned_at, documents!inner(${columns})`)
      .eq('user_id', userId)
      .eq('documents.is_deleted', false)
      .order('pinned_at', { ascending: false }),
  )
  if (isMissingTable(error)) throw new PinsUnavailableError()
  if (error) throw new Error(`Failed to get pinned documents: ${error.message}`)

  const rows = (data ?? []).filter((row): row is PinRow & { documents: Omit<Document, 'content'> } => row.documents !== null)
  const others = await sharedWith(userId, rows.filter((row) => row.documents.user_id !== userId).map((row) => row.documents.id))
  return rows
    .filter((row) => row.documents.user_id === userId || others.has(row.documents.id))
    .map((row) => ({ ...row.documents, content: '', pinned_at: row.pinned_at }))
}
