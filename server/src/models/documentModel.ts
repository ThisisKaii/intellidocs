import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { Document, CreateDocumentRequest, UpdateDocumentRequest, DocumentVersion, FormatSnapshot, PageNumberFormat } from '../types/index'
import { getRedisClient } from '../utils/redisClient'
import { isDestructiveBlankOverwrite } from '../utils/documentGuards'
import { assertWithinStorageQuota } from './userModel'
import { isShareLinkExpired } from './shareModel'
import { nextUniqueTitle } from '../utils/uniqueTitle'
import { extractPreviewSnippet } from '../utils/previewSnippet'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * Column set for list endpoints. Excludes the heavyweight `content` column:
 * documents can contain several MB of formatted text, and fetching it for
 * every row on the home screen exceeded Supabase's statement timeout.
 */
const LIST_BASE_COLUMNS =
  'id,user_id,title,header_content,footer_content,show_header,show_footer,header_number_format,footer_number_format,page_size,margins,orientation,formatting_history,is_isolated,formatting_preset,is_deleted,deleted_at,share_permission,share_token,share_expires_at,created_at,updated_at'

/** List columns plus the lightweight grid-preview snippet (migration 026). */
const LIST_COLUMNS = `${LIST_BASE_COLUMNS},preview_snippet`

/** PostgREST/Postgres error codes for an unknown column (migration 026 not applied). */
const UNDEFINED_COLUMN_CODES = ['42703', 'PGRST204']

/** True when the error means `preview_snippet` does not exist yet. */
function isUndefinedColumnError(error: { code?: string } | null): boolean {
  return Boolean(error?.code && UNDEFINED_COLUMN_CODES.includes(error.code))
}

/** Subset of a Supabase list response the preview fallback inspects. */
export interface ListResponse<T> {
  data: T[] | null
  error: { code?: string; message: string } | null
}

/**
 * Run a documents list query with `preview_snippet`, automatically retrying
 * with the legacy column set while migration 026 has not been applied.
 * The builder resolves through `unknown` because Supabase's untyped client
 * otherwise rejects the structural `PromiseLike` match.
 */
export async function listDocuments<T>(
  build: (columns: string) => unknown,
): Promise<ListResponse<T>> {
  const result = (await build(LIST_COLUMNS)) as ListResponse<T>
  if (isUndefinedColumnError(result.error)) {
    return (await build(LIST_BASE_COLUMNS)) as ListResponse<T>
  }
  return result
}

/** MIME types accepted for editor image uploads (matches the bucket policy). */
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

/**
 * Upload an editor image into the public `document-images` bucket under the
 * owner's folder and return its public URL.
 */
export async function uploadDocumentImage(
  userId: string,
  file: { buffer: Buffer; mimetype: string },
): Promise<string> {
  const extension = IMAGE_MIME_EXTENSIONS[file.mimetype] ?? 'png'
  const objectPath = `${userId}/${randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from('document-images')
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false })
  if (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
  const { data } = supabase.storage.from('document-images').getPublicUrl(objectPath)
  return data.publicUrl
}

/** 1-hour TTL for cached document reads. */
const DOC_CACHE_TTL = 3600

/** Count words in a serialized HTML document by stripping tags first. */
function countWords(content: string): number {
  const text = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

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
  const { data, error } = await listDocuments<Omit<Document, 'content'>>((columns) =>
    supabase
      .from('documents')
      .select(columns)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
  )
  if (error) throw new Error(`Failed to get documents: ${error.message}`)
  return (data || []).map((row) => ({ ...row, content: '' }))
}

/** Return documents in the trash (soft-deleted, owned by the user). */
export async function getTrashDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await listDocuments<Omit<Document, 'content'>>((columns) =>
    supabase
      .from('documents')
      .select(columns)
      .eq('user_id', userId)
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false }),
  )
  if (error) throw new Error(`Failed to get trash documents: ${error.message}`)
  return (data || []).map((row) => ({ ...row, content: '' }))
}

/** Return documents shared to this user by others (active non-deleted shares). */
export async function getSharedDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await listDocuments<
    Omit<Document, 'content'> & { document_shares?: { permission: string; owner_id: string }[] }
  >((columns) =>
    supabase
      .from('documents')
      .select(`${columns}, document_shares!inner(permission, owner_id)`)
      .eq('document_shares.shared_with', userId)
      .eq('is_deleted', false),
  )

  if (error) throw new Error(`Failed to get shared documents: ${error.message}`)

  return (data || []).map((d) => ({
    ...d,
    content: '',
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
 * pending-email collaborators can all retrieve it. A valid (unexpired) share
 * link token grants access; edit links are honored on the write path too.
 * Throws 404 when the document does not exist or is not readable by this user.
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
  const viaShareLink =
    Boolean(shareToken) &&
    doc.share_token === shareToken &&
    !isShareLinkExpired(doc.share_expires_at)
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

/**
 * Resolve a title that does not clash with any of the user's active documents,
 * numbering duplicates "Name (1)", "Name (2)", ... (trashed documents do not count).
 */
export async function resolveUniqueTitle(userId: string, base: string): Promise<string> {
  const clean = base.trim()
  // `_` and `%` are LIKE wildcards; escape them so a title is matched literally.
  const pattern = `${clean.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { data, error } = await supabase
    .from('documents')
    .select('title')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .ilike('title', pattern)
  if (error) throw new Error(`Failed to check document titles: ${error.message}`)
  return nextUniqueTitle(clean, (data ?? []).map((row: { title: string }) => row.title))
}

export async function createDocument(
  userId: string,
  req: CreateDocumentRequest
): Promise<Document> {
  await assertWithinStorageQuota(userId, Buffer.byteLength(req.content ?? ''))
  const row: Record<string, unknown> = {
    user_id: userId,
    title: req.unique_title ? await resolveUniqueTitle(userId, req.title) : req.title,
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
    ...(req.formatting_preset
      ? { formatting_preset: req.formatting_preset }
      : {}),
  }

  let { data, error } = await supabase
    .from('documents')
    .insert({ ...row, preview_snippet: extractPreviewSnippet(req.content ?? '') })
    .select()
    .single()

  if (isUndefinedColumnError(error)) {
    ;({ data, error } = await supabase.from('documents').insert(row).select().single())
  }

  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data
}

/** Copy an update payload without the columns added by later migrations (pre-migration retry). */
function withoutPreviewSnippet(payload: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payload }
  delete clone.preview_snippet
  delete clone.citation_data
  return clone
}

export async function updateDocument(
  id: string,
  userId: string,
  req: UpdateDocumentRequest,
  shareToken?: string | undefined,
): Promise<Document> {
  // Owner and edit/comment collaborators may update. Verified via share access.
  // An unexpired share link with edit permission also permits updates.
  const doc = await getDocumentForUser(id, userId, undefined, shareToken)
  const canWrite =
    doc.user_id === userId ||
    (doc.share_token === shareToken &&
      doc.share_permission === 'edit' &&
      !isShareLinkExpired(doc.share_expires_at)) ||
    (await hasShareAccess(id, userId, undefined, 'edit'))

  if (!canWrite) {
    const forbidden = new Error('You do not have permission to edit this document') as Error & { status: number }
    forbidden.status = 403
    throw forbidden
  }

  // A page that saved before its document finished loading sends the editor's
  // defaults (blank content + "Untitled Document"); never let that replace a
  // real, renamed document. Older cached client bundles can still do this.
  if (isDestructiveBlankOverwrite(doc, req)) {
    const conflict = new Error('Refusing to replace a non-empty document with an empty, untitled one') as Error & { status: number }
    conflict.status = 409
    throw conflict
  }

  // Only growth counts toward the owner's quota; shrinking a document always saves.
  if (req.content !== undefined) {
    await assertWithinStorageQuota(doc.user_id, Buffer.byteLength(req.content) - Buffer.byteLength(doc.content ?? ''))
  }

  // Refresh the grid-preview snippet whenever the content changes.
  const updates =
    req.content === undefined
      ? req
      : { ...req, preview_snippet: extractPreviewSnippet(req.content) }

  let { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (isUndefinedColumnError(error)) {
    // Migration 026 not applied yet — retry without the snippet column.
    ;({ data, error } = await supabase
      .from('documents')
      .update(withoutPreviewSnippet(updates as Record<string, unknown>))
      .eq('id', id)
      .select()
      .single())
  }

  if (error) throw new Error(`Failed to update document: ${error.message}`)
  void invalidateDocumentCache(id)

  // Snapshot the new state for the undo-lock version history (best-effort).
  const updated = data! as Document
  if (updated.content) {
    void snapshotDocumentVersion(updated, 'autosave')
  }

  return updated
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

/** Minimum time (ms) between consecutive snapshots for the same document. */
const VERSION_THROTTLE_MS = 3000

/** Format state bundled into every version snapshot (stored in editor_prefs). */
const buildFormatSnapshot = (doc: Document): FormatSnapshot => ({
  formatting_history: Array.isArray(doc.formatting_history)
    ? (doc.formatting_history as string[])
    : [],
  formatting_preset: doc.formatting_preset ?? null,
  header_content: doc.header_content ?? '',
  footer_content: doc.footer_content ?? '',
  show_header: doc.show_header ?? false,
  show_footer: doc.show_footer ?? false,
  header_number_format: doc.header_number_format ?? 'none',
  footer_number_format: doc.footer_number_format ?? 'none',
})

/** Read a format snapshot back from a version's editor_prefs (defensive). */
const readFormatSnapshot = (
  raw: Record<string, unknown> | null | undefined,
): FormatSnapshot => {
  if (!raw || typeof raw !== 'object') {
    return {
      formatting_history: [],
      formatting_preset: null,
      header_content: '',
      footer_content: '',
      show_header: false,
      show_footer: false,
      header_number_format: 'none',
      footer_number_format: 'none',
    }
  }
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  const stringOf = (value: unknown, fallback: string): string =>
    typeof value === 'string' ? value : fallback
  const boolOf = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  const numberFormat = (value: unknown): PageNumberFormat =>
    value === 'number' || value === 'roman' ? value : 'none'

  return {
    formatting_history: stringArray(raw.formatting_history),
    formatting_preset:
      typeof raw.formatting_preset === 'string' ? raw.formatting_preset : null,
    header_content: stringOf(raw.header_content, ''),
    footer_content: stringOf(raw.footer_content, ''),
    show_header: boolOf(raw.show_header, false),
    show_footer: boolOf(raw.show_footer, false),
    header_number_format: numberFormat(raw.header_number_format),
    footer_number_format: numberFormat(raw.footer_number_format),
  }
}

/** Insert a new version snapshot, throttled to avoid a row per keystroke. */
export async function snapshotDocumentVersion(
  doc: Document,
  reason = 'autosave',
): Promise<void> {
  try {
    const redis = await getRedisClient()
    const key = `version:${doc.id}:last`
    const raw = await redis.get(key)
    if (raw) {
      const last = Number(raw)
      if (Date.now() - last < VERSION_THROTTLE_MS) return
    }

    const { error } = await supabase.from('document_versions').insert({
      document_id: doc.id,
      user_id: doc.user_id,
      content: doc.content,
      title: doc.title,
      word_count: countWords(doc.content),
      page_size: doc.page_size,
      margins: doc.margins ?? null,
      orientation: doc.orientation,
      editor_prefs: buildFormatSnapshot(doc),
      reason,
    })
    if (error) {
      throw new Error(`Failed to snapshot document version: ${error.message}`)
    }
    await redis.set(key, String(Date.now()), { EX: 3600 })
  } catch {
    /* Version snapshotting is best-effort and must never break saves. */
  }
}

/** List version snapshots for a document, newest first. */
export async function getDocumentVersions(
  documentId: string,
  userId: string,
): Promise<DocumentVersion[]> {
  // Only the owner may read the version history of a document.
  const doc = await getDocumentById(documentId, userId)

  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', doc.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Failed to list document versions: ${error.message}`)
  return data || []
}

/** Fetch a single version snapshot (owner only). */
export async function getDocumentVersionById(
  documentId: string,
  versionId: string,
  userId: string,
): Promise<DocumentVersion> {
  await getDocumentById(documentId, userId)

  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .eq('version_id', versionId)
    .single()

  if (error) {
    const notFound = new Error('Document version not found') as Error & { status: number }
    notFound.status = 404
    throw notFound
  }
  return data
}

/** Restore a snapshot onto the document (newest state presumes latest content). */
export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  userId: string,
): Promise<Document> {
  const version = await getDocumentVersionById(documentId, versionId, userId)
  const prefs = readFormatSnapshot(version.editor_prefs)

  const { data, error } = await supabase
    .from('documents')
    .update({
      content: version.content,
      title: version.title,
      page_size: version.page_size ?? undefined,
      margins: version.margins ?? undefined,
      orientation: version.orientation ?? undefined,
      header_content: prefs.header_content,
      footer_content: prefs.footer_content,
      show_header: prefs.show_header,
      show_footer: prefs.show_footer,
      header_number_format: prefs.header_number_format,
      footer_number_format: prefs.footer_number_format,
      formatting_history: prefs.formatting_history,
      formatting_preset: prefs.formatting_preset,
    })
    .eq('id', documentId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`Failed to restore document version: ${error.message}`)
  void invalidateDocumentCache(documentId)
  return data!
}
