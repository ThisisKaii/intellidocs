import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Document, CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'
import { getRedisClient } from '../utils/redisClient'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** 1-hour TTL for cached document reads. */
const DOC_CACHE_TTL = 3600

/** Cache is opt-in to keep local dev snappy when Redis is not running. */
const DOC_CACHE_ENABLED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.DOC_CACHE_ENABLED === 'true',
)

/** Write a document into the Redis read cache (fail-open). */
async function cacheDocument(doc: Document): Promise<void> {
  if (!DOC_CACHE_ENABLED) return
  try {
    const redis = await getRedisClient()
    await redis.set(`doc:cache:${doc.id}`, JSON.stringify(doc), { EX: DOC_CACHE_TTL })
  } catch {
    /* Cache failures must never break document reads. */
  }
}

/** Read a document from the Redis cache, or null on miss/error. */
async function getCachedDocument(id: string): Promise<Document | null> {
  if (!DOC_CACHE_ENABLED) return null
  try {
    const redis = await getRedisClient()
    const raw = await redis.get(`doc:cache:${id}`)
    if (!raw) return null
    return JSON.parse(raw) as Document
  } catch {
    return null
  }
}

/** Invalidate a document cache entry after a write (fail-open). */
async function invalidateDocumentCache(id: string): Promise<void> {
  if (!DOC_CACHE_ENABLED) return
  try {
    const redis = await getRedisClient()
    await redis.del(`doc:cache:${id}`)
  } catch {
    /* noop */
  }
}

export async function getDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to get documents: ${error.message}`)
  return data || []
}

/** Return documents in the trash (soft-deleted, owned by the user). */
export async function getTrashDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false })
  if (error) throw new Error(`Failed to get trash documents: ${error.message}`)
  return data || []
}

/** Return documents shared to this user by others (active non-deleted shares). */
export async function getSharedDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*, document_shares!inner(permission, owner_id)')
    .eq('document_shares.shared_with', userId)
    .eq('is_deleted', false)

  if (error) throw new Error(`Failed to get shared documents: ${error.message}`)

  return (data || []).map((d: Document & { document_shares?: { permission: string; owner_id: string }[] }) => ({
    ...d,
    share_permission: (d.document_shares?.[0]?.permission ?? 'view') as Document['share_permission'],
    shared_by: d.document_shares?.[0]?.owner_id,
  }))
}

export async function getDocumentById(id: string, userId: string): Promise<Document> {
  const cached = await getCachedDocument(id)
  if (cached && cached.user_id === userId) return cached

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      const notFound = new Error('Document not found') as Error & { status: number }
      notFound.status = 404
      throw notFound
    }
    throw new Error(`Failed to get document: ${error.message}`)
  }
  void cacheDocument(data!)
  return data!
}

/**
 * Fetch a document by id with access checks: owners, active collaborators, or
 * pending-email collaborators can all retrieve it. A valid share link token
 * grants read-only access. Throws 404 when the document does not exist or is
 * not readable by this user.
 */
export async function getDocumentForUser(
  id: string,
  userId: string,
  userEmail: string | undefined,
  shareToken?: string | undefined,
): Promise<Document> {
  // Owner hits can be served from the read cache (permission is static).
  const cached = await getCachedDocument(id)
  if (cached && cached.user_id === userId) return cached

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      const notFound = new Error('Document not found') as Error & { status: number }
      notFound.status = 404
      throw notFound
    }
    throw new Error(`Failed to get document: ${error.message}`)
  }

  const doc = data as Document
  const viaShareLink = Boolean(shareToken) && doc.share_token === shareToken
  const canRead =
    doc.user_id === userId ||
    (await hasShareAccess(id, userId, userEmail, 'view')) ||
    viaShareLink

  if (!canRead) {
    const forbidden = new Error('You do not have access to this document') as Error & { status: number }
    forbidden.status = 403
    throw forbidden
  }

  void cacheDocument(doc)
  return doc
}

/** Whether the user holds at least the given permission level on a document. */
export async function hasShareAccess(
  documentId: string,
  userId: string,
  _userEmail: string | undefined,
  minimum: 'view' | 'comment' | 'edit',
): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_shares')
    .select('permission')
    .eq('document_id', documentId)
    .eq('shared_with', userId)
    .in('permission', minimum === 'edit' ? ['edit'] : minimum === 'comment' ? ['edit', 'comment'] : ['edit', 'comment', 'view'])
    .limit(1)
  if (error) throw new Error(`Failed to check share access: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Soft-delete a document (moves it to the trash). */
export async function softDeleteDocument(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to trash document: ${error.message}`)
  void invalidateDocumentCache(id)
}

/** Restore a trash document back into the active list. */
export async function restoreDocument(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to restore document: ${error.message}`)
  void invalidateDocumentCache(id)
}

/** Permanently delete a document (owner only, removes the row entirely). */
export async function purgeDocument(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to permanently delete document: ${error.message}`)
  void invalidateDocumentCache(id)
}

export async function createDocument(
  userId: string,
  req: CreateDocumentRequest
): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      title: req.title,
      content: req.content ?? '',
      header_content: req.header_content ?? '',
      footer_content: req.footer_content ?? '',
      show_header: req.show_header ?? false,
      show_footer: req.show_footer ?? false,
      header_number_format: req.header_number_format ?? 'none',
      footer_number_format: req.footer_number_format ?? 'none',
      page_size: req.page_size ?? 'short',
      margins: req.margins ?? { top: 1, bottom: 1, left: 1.5, right: 1 },
      orientation: req.orientation ?? 'portrait',
      formatting_history: [],
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data
}

export async function updateDocument(
  id: string,
  userId: string,
  req: UpdateDocumentRequest,
): Promise<Document> {
  // Owner and edit/comment collaborators may update. Verified via share access.
  const doc = await getDocumentForUser(id, userId, undefined)
  const canWrite =
    doc.user_id === userId ||
    (await hasShareAccess(id, userId, undefined, 'edit'))

  if (!canWrite) {
    const forbidden = new Error('You do not have permission to edit this document') as Error & { status: number }
    forbidden.status = 403
    throw forbidden
  }

  const { data, error } = await supabase
    .from('documents')
    .update(req)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update document: ${error.message}`)
  void invalidateDocumentCache(id)
  return data!
}

export async function deleteDocument(
  id: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete document: ${error.message}`)
}
