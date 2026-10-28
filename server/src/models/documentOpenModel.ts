import { supabase, listDocuments } from './documentModel'
import { Document } from '../types/index'

/** A document stays in "Recent" for this long after the user last opened it. */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Postgres / PostgREST codes for a missing table (migration 034 not applied yet). */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

/** Thrown when the document_opens table does not exist yet, so callers can say so plainly. */
export class RecentUnavailableError extends Error {
  constructor() {
    super('Recent is not available until migration 034 is applied')
    this.name = 'RecentUnavailableError'
  }
}

/** True when the error means the document_opens table is missing. */
function isMissingTable(error: { code?: string } | null): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.includes(error.code))
}

/**
 * Remember that the user opened a document just now. Opening it again overwrites the time, which
 * moves the document to the top of "Recent" and restarts its 7 days. The caller checks access first.
 */
export async function recordOpen(userId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('document_opens')
    .upsert({ user_id: userId, document_id: documentId, last_opened_at: new Date().toISOString() }, { onConflict: 'user_id,document_id' })
  if (isMissingTable(error)) throw new RecentUnavailableError()
  if (error) throw new Error(`Failed to record document open: ${error.message}`)
}

/** Row shape of a document_opens join: the open time plus the embedded document. */
interface OpenRow {
  last_opened_at: string
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
 * Documents the user opened in the last 7 days, most recently opened first. Trashed documents and
 * documents the user can no longer read (an unshared document someone else owns) are left out.
 */
export async function listRecentDocuments(userId: string, now: number = Date.now()): Promise<Document[]> {
  const since = new Date(now - RECENT_WINDOW_MS).toISOString()
  const { data, error } = await listDocuments<OpenRow>((columns) =>
    supabase
      .from('document_opens')
      .select(`last_opened_at, documents!inner(${columns})`)
      .eq('user_id', userId)
      .gte('last_opened_at', since)
      .eq('documents.is_deleted', false)
      .order('last_opened_at', { ascending: false }),
  )
  if (isMissingTable(error)) throw new RecentUnavailableError()
  if (error) throw new Error(`Failed to get recent documents: ${error.message}`)

  const rows = (data ?? []).filter((row): row is OpenRow & { documents: Omit<Document, 'content'> } => row.documents !== null)
  const others = await sharedWith(userId, rows.filter((row) => row.documents.user_id !== userId).map((row) => row.documents.id))
  return rows
    .filter((row) => row.documents.user_id === userId || others.has(row.documents.id))
    .map((row) => ({ ...row.documents, content: '', last_opened_at: row.last_opened_at }))
}
