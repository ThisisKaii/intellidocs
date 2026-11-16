import { randomUUID } from 'crypto'
import type { CreateDocumentRequest, Document, EditorJson } from '../types/index'
import { EDITOR_JSON_MAX_CHARS } from '../../schemas/documentSchemas'
import {
  buildFormatSnapshot,
  canEditDocument,
  contentBytes,
  createDocument,
  getDocumentForUser,
  getDocumentMetaForUser,
  invalidateDocumentCache,
  markVersionSnapshot,
  supabase,
  versionSnapshotDue,
} from './documentModel'
import { assertWithinStorageQuota } from './userModel'
import { extractPreviewSnippet } from '../utils/previewSnippet'
import {
  bodyText,
  cleanTabTitle,
  countBodyWords,
  hasTabBreaks,
  splitBody,
  stripTabBreaks,
  tabBreakHtml,
  type BodyPart,
} from '../utils/documentTabs'

/**
 * Document tabs (migration 048): each tab's body lives in `document_tabs`, and the tabs are the only
 * stored copy of a tabbed document's text. The document's own `content` keeps a skeleton: the tab
 * markers in order, with nothing between them (`content_json` is null), so `hasTabBreaks` still
 * tells a tabbed document apart. Code that needs the whole text reads it with `documentBody`.
 *
 * The whole body used to be rebuilt in the database after every tab save. A 1,447-page thesis
 * (13 MB of HTML, 27 MB of editor JSON) could not be written that way at all: the rebuild ran past
 * the statement timeout, and a 27 MB JSON write took the database's gateway down. Each write now
 * carries one tab, a batch of tabs, or the skeleton.
 *
 * Versions of a tabbed document are kept per tab (migration 049: document_versions.tab_id).
 */

/** Page numbering of a tab: its format, and whether it restarts (null numbering = continue). */
export interface TabNumbering {
  format: 'none' | 'roman' | 'arabic'
  restart: boolean
  start: number
  hideFirst: boolean
}

/** A tab without its body (what the document page lists). */
export interface TabSummary {
  tab_id: string
  title: string
  position: number
  page_count: number
  word_count: number
  numbering: TabNumbering | null
  caption_counts: Record<string, unknown> | null
  outline: unknown[] | null
  updated_at: string
}

export interface DocumentTab extends TabSummary {
  document_id: string
  content: string
  content_json: EditorJson | null
}

const SUMMARY_COLUMNS = 'tab_id,title,position,page_count,word_count,numbering,caption_counts,outline,updated_at'

/** Thrown when migration 048 has not been applied: tabs are unavailable (503). */
export class MissingTabsTableError extends Error {
  status = 503
  code = 'tabs_unavailable'
  constructor() {
    super('Document tabs need database migration 048_document_tabs.sql.')
  }
}

function httpError(message: string, status: number, code?: string): Error & { status: number; code?: string } {
  return Object.assign(new Error(message), { status, code })
}

/** PostgREST / Postgres codes for a missing table or function (migration not applied). */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return ['42P01', 'PGRST205', '42883', 'PGRST202'].includes(error.code ?? '') || /document_tabs|assemble_document_tabs|snapshot_document_version/.test(error.message ?? '')
}

function fail(error: { code?: string; message: string }, action: string): never {
  if (isMissingSchema(error)) throw new MissingTabsTableError()
  throw new Error(`Failed to ${action}: ${error.message}`)
}

/** Most characters of tab rows sent in one write: a request well inside the statement timeout. */
const TAB_WRITE_BATCH_CHARS = 3_000_000

/** Tab rows grouped so each write carries at most TAB_WRITE_BATCH_CHARS (at least one row). */
function byBatch<T extends { content: string; content_json?: EditorJson | null }>(rows: T[]): T[][] {
  const batches: T[][] = []
  let size = 0
  for (const row of rows) {
    const chars = row.content.length + (row.content_json ? JSON.stringify(row.content_json).length : 0)
    if (batches.length === 0 || size + chars > TAB_WRITE_BATCH_CHARS) {
      batches.push([])
      size = 0
    }
    batches[batches.length - 1].push(row)
    size += chars
  }
  return batches
}

/**
 * A document the caller may read, and whether they may change it. With `withBody: false` the
 * document comes without its body (saving or reading one tab never needs the whole manuscript).
 */
export async function documentForTabs(
  documentId: string,
  userId: string,
  userEmail: string | undefined,
  shareToken: string | undefined,
  needEdit: boolean,
  withBody = true,
): Promise<Document> {
  const doc = withBody
    ? await getDocumentForUser(documentId, userId, userEmail, shareToken)
    : await getDocumentMetaForUser(documentId, userId, userEmail, shareToken)
  if (needEdit && !(await canEditDocument(doc, userId, shareToken))) {
    throw httpError('You do not have permission to edit this document', 403)
  }
  return doc
}

/** The document's tabs in order, without bodies; empty for an untabbed document or before migration 048. */
export async function listTabs(documentId: string): Promise<TabSummary[]> {
  const { data, error } = await supabase
    .from('document_tabs')
    .select(SUMMARY_COLUMNS)
    .eq('document_id', documentId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingSchema(error)) return []
    throw new Error(`Failed to list document tabs: ${error.message}`)
  }
  return (data ?? []) as TabSummary[]
}

/** One tab with its body. */
export async function getTab(documentId: string, tabId: string): Promise<DocumentTab> {
  const { data, error } = await supabase
    .from('document_tabs')
    .select('*')
    .eq('document_id', documentId)
    .eq('tab_id', tabId)
    .maybeSingle()
  if (error) fail(error, 'read the tab')
  if (!data) throw httpError('Tab not found', 404)
  return data as DocumentTab
}

/**
 * Write the document's skeleton (one marker per tab, in order) after its tabs changed, then forget
 * the cached document. The tabs' text is never copied into the document row.
 */
async function assemble(documentId: string): Promise<void> {
  const tabs = await listTabs(documentId)
  if (tabs.length === 0) return
  const skeleton = tabs.map((tab) => tabBreakHtml(tab.tab_id, tab.title)).join('')
  const { error } = await supabase
    .from('documents')
    .update({ content: skeleton, content_json: null, updated_at: new Date().toISOString() })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to update the document's tabs: ${error.message}`)
  await invalidateDocumentCache(documentId)
}

/** Tab bodies fetched at once while reading a whole document (each can be a few megabytes). */
const BODY_FETCH_CONCURRENCY = 4

/** The bodies of the given tabs (HTML, and the editor JSON when asked), in the same order. */
async function tabBodies(
  tabs: Array<Pick<TabSummary, 'tab_id'>>,
  withJson: boolean,
): Promise<Array<{ content: string; content_json: EditorJson | null }>> {
  const out: Array<{ content: string; content_json: EditorJson | null }> = []
  for (let start = 0; start < tabs.length; start += BODY_FETCH_CONCURRENCY) {
    const chunk = tabs.slice(start, start + BODY_FETCH_CONCURRENCY)
    const loaded = await Promise.all(
      chunk.map(async (tab) => {
        const { data, error } = await supabase
          .from('document_tabs')
          .select(withJson ? 'content,content_json' : 'content')
          .eq('tab_id', tab.tab_id)
          .maybeSingle()
        if (error) fail(error, 'read the tab')
        const row = (data ?? {}) as { content?: string; content_json?: EditorJson | null }
        return { content: row.content ?? '', content_json: row.content_json ?? null }
      }),
    )
    out.push(...loaded)
  }
  return out
}

/**
 * A document's whole body as HTML: its own content, or for a tabbed document its tabs joined in
 * order, each after its marker. Read in memory only, for code that needs all the text (AI chat,
 * originality checks, a professor's review); never written back as one body.
 */
export async function documentBody(doc: Pick<Document, 'id' | 'content'>): Promise<string> {
  if (!hasTabBreaks(doc.content)) return doc.content ?? ''
  const tabs = await listTabs(doc.id)
  // Before migration 048, or a body whose rows are gone: the stored content is all there is.
  if (tabs.length === 0) return doc.content ?? ''
  const bodies = await tabBodies(tabs, false)
  return tabs.map((tab, index) => tabBreakHtml(tab.tab_id, tab.title) + bodies[index].content).join('')
}

/** Refresh the grid preview from the first tab's text. */
async function refreshPreview(documentId: string, firstTabHtml: string): Promise<void> {
  await supabase.from('documents').update({ preview_snippet: extractPreviewSnippet(firstTabHtml) }).eq('id', documentId)
}

/** One tab's state, as a version records it. */
interface TabState {
  tab_id: string
  title: string
  position: number
  content: string
  content_json: EditorJson | null
}

/**
 * Save one tab as a version (migration 049). Throttled per tab like whole-document snapshots,
 * unless `force` (before a tab is deleted). Best-effort: without migration 049 there are no tab
 * versions (a version without its tab would restore one chapter over the whole document).
 */
async function snapshotTab(doc: Document, tab: TabState, reason: string, force = false): Promise<void> {
  const throttleKey = `${doc.id}:${tab.tab_id}`
  try {
    if (!force && !(await versionSnapshotDue(throttleKey))) return
    const { error } = await supabase.from('document_versions').insert({
      document_id: doc.id,
      user_id: doc.user_id,
      tab_id: tab.tab_id,
      tab_title: tab.title,
      tab_position: tab.position,
      content: tab.content,
      content_json: tab.content_json,
      title: doc.title,
      word_count: countBodyWords(tab.content),
      page_size: doc.page_size,
      margins: doc.margins ?? null,
      orientation: doc.orientation,
      editor_prefs: buildFormatSnapshot(doc),
      reason,
    })
    if (error) return
    await markVersionSnapshot(throttleKey)
  } catch {
    /* Version snapshots never break a save. */
  }
}

export interface SaveTabInput {
  content: string
  content_json?: EditorJson | null
  page_count?: number
  caption_counts?: Record<string, unknown> | null
  outline?: unknown[] | null
}

/** Save one tab's body (what the editor sends while a tab is open). */
export async function saveTab(doc: Document, tabId: string, input: SaveTabInput): Promise<TabSummary> {
  const existing = await getTab(doc.id, tabId)
  // Only growth counts toward the owner's quota, as for whole documents.
  await assertWithinStorageQuota(
    doc.user_id,
    contentBytes(input.content, input.content_json) - contentBytes(existing.content, existing.content_json),
  )
  const update: Record<string, unknown> = {
    content: input.content,
    // JSON sent with the HTML replaces the stored JSON; none clears it so stale JSON never wins.
    content_json: input.content_json ?? null,
    word_count: countBodyWords(input.content),
    updated_at: new Date().toISOString(),
  }
  if (typeof input.page_count === 'number') update.page_count = Math.max(0, Math.round(input.page_count))
  if (input.caption_counts !== undefined) update.caption_counts = input.caption_counts
  if (input.outline !== undefined) update.outline = input.outline

  const { data, error } = await supabase
    .from('document_tabs')
    .update(update)
    .eq('document_id', doc.id)
    .eq('tab_id', tabId)
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) fail(error, 'save the tab')

  // The skeleton only changes when tabs are added, moved or renamed; a text save touches the
  // document row just to mark it updated.
  await supabase.from('documents').update({ updated_at: new Date().toISOString() }).eq('id', doc.id)
  await invalidateDocumentCache(doc.id)
  // Positions run 0, 1, 2…: the first tab's text is the grid preview.
  if (existing.position === 0) await refreshPreview(doc.id, input.content)
  void snapshotTab(doc, { ...existing, content: input.content, content_json: input.content_json ?? null }, 'autosave')
  return data as TabSummary
}

/**
 * Make the rows match the tab markers in a whole body: tabs whose marker carries a known id keep
 * their row (so open editors and collaboration rooms stay attached), new markers get new tabs, and
 * rows without a marker are removed. The body is then rebuilt from the rows, which writes every
 * marker with its id. Returns the tabs, or [] when the body has no markers (then every row goes).
 */
export async function syncTabsFromBody(
  doc: Document,
  content: string,
  contentJson: EditorJson | null | undefined,
): Promise<TabSummary[]> {
  const parts = splitBody(content, contentJson)
  const current = await listTabs(doc.id)
  if (!parts) {
    if (current.length > 0) {
      const { error } = await supabase.from('document_tabs').delete().eq('document_id', doc.id)
      if (error) fail(error, 'remove the tabs')
    }
    return []
  }
  const known = new Set(current.map((tab) => tab.tab_id))
  const used = new Set<string>()
  const now = new Date().toISOString()
  const rows = parts.map((part: BodyPart, position) => {
    // A duplicated marker (copy-pasted) cannot share its tab: it becomes a new one.
    const keep = part.tabId && known.has(part.tabId) && !used.has(part.tabId) ? part.tabId : null
    const tabId = keep ?? randomUUID()
    used.add(tabId)
    return {
      tab_id: tabId,
      document_id: doc.id,
      position,
      title: cleanTabTitle(part.title),
      content: part.content,
      content_json: part.content_json,
      word_count: countBodyWords(part.content),
      updated_at: now,
    }
  })

  for (const batch of byBatch(rows)) {
    const { error } = await supabase.from('document_tabs').upsert(batch, { onConflict: 'tab_id' })
    if (error) fail(error, 'save the tabs')
  }
  const removed = current.filter((tab) => !used.has(tab.tab_id)).map((tab) => tab.tab_id)
  if (removed.length > 0) {
    const { error: deleteError } = await supabase.from('document_tabs').delete().eq('document_id', doc.id).in('tab_id', removed)
    if (deleteError) fail(deleteError, 'remove a tab')
  }
  await assemble(doc.id)
  await refreshPreview(doc.id, rows[0].content)
  return listTabs(doc.id)
}

/**
 * Split a document into tabs: `content`/`content_json` are its body with a marker before each tab.
 * Refused when the text differs from the saved document, so a split can never lose or add text
 * (it only places markers).
 */
export async function splitDocument(
  doc: Document,
  content: string,
  contentJson: EditorJson | null | undefined,
): Promise<TabSummary[]> {
  const parts = splitBody(content, contentJson)
  if (!parts || parts.length < 1) throw httpError('The split has no tabs.', 400)
  if (bodyText(content) !== bodyText(doc.content ?? '')) {
    throw httpError('The document changed since the split was prepared. Reload and split again.', 409, 'split_out_of_date')
  }
  return syncTabsFromBody(doc, content, contentJson)
}

/**
 * Create a document whose body the converter already split into tabs (a long manuscript import).
 * The document row is created with only its skeleton and the tabs are inserted a few at a time,
 * so no single request carries the whole manuscript (a 13 MB body in one insert ran past the
 * statement timeout). Each tab keeps its editor
 * JSON while under the stored size cap. A body without markers is created as usual, and so is a
 * split body while migration 048 is missing (its markers are dropped).
 */
export async function createTabbedDocument(userId: string, req: CreateDocumentRequest): Promise<Document> {
  const parts = req.content ? splitBody(req.content, req.content_json) : null
  if (!parts) return createDocument(userId, req)
  const tabs = parts.map((part, position) => {
    const json = part.content_json && JSON.stringify(part.content_json).length <= EDITOR_JSON_MAX_CHARS ? part.content_json : null
    return { tab_id: randomUUID(), position, title: cleanTabTitle(part.title), content: part.content, content_json: json }
  })
  // Checked on the HTML, as an import has always been: a long manuscript's raw editor JSON (27 MB for
  // a 1,447-page thesis) would refuse it outright, though the database stores and counts it
  // compressed (user_storage_bytes uses pg_column_size).
  await assertWithinStorageQuota(userId, tabs.reduce((sum, tab) => sum + Buffer.byteLength(tab.content), 0))

  const doc = await createDocument(userId, { ...req, content: '', content_json: null })
  try {
    const now = new Date().toISOString()
    const rows = tabs.map((tab) => ({ ...tab, document_id: doc.id, word_count: countBodyWords(tab.content), updated_at: now }))
    for (const batch of byBatch(rows)) {
      const { error } = await supabase.from('document_tabs').insert(batch)
      if (error) fail(error, 'save the tabs')
    }
    await assemble(doc.id)
    await refreshPreview(doc.id, tabs[0].content)
  } catch (error) {
    await supabase.from('documents').delete().eq('id', doc.id)
    if (!(error instanceof MissingTabsTableError)) throw error
    const whole = stripTabBreaks(req.content ?? '', req.content_json ?? null)
    const fits = whole.content_json && JSON.stringify(whole.content_json).length <= EDITOR_JSON_MAX_CHARS
    return createDocument(userId, { ...req, content: whole.content, content_json: fits ? whole.content_json : null })
  }
  return doc
}

/** Largest body (HTML plus editor JSON, in characters) merged back into one document row. */
const MERGE_MAX_CHARS = 8_000_000

/**
 * Put every tab back into one body (the document is then untabbed, as before it was split). The
 * body is written before the tabs are removed, so a failed write loses nothing. A manuscript too
 * long to be stored as one body stays in tabs (413).
 */
export async function mergeTabs(doc: Document): Promise<void> {
  const current = await listTabs(doc.id)
  if (current.length === 0) return
  const bodies = await tabBodies(current, true)
  const content = bodies.map((body) => body.content).join('')
  const json = bodies.every((body) => body.content_json)
    ? ({ type: 'doc', content: bodies.flatMap((body) => (body.content_json?.content as unknown[]) ?? []) } as EditorJson)
    : null
  if (content.length + (json ? JSON.stringify(json).length : 0) > MERGE_MAX_CHARS) {
    throw httpError('This document is too long to merge into one body. Keep it in tabs.', 413, 'merge_too_large')
  }
  const { error } = await supabase
    .from('documents')
    .update({ content, content_json: json, preview_snippet: extractPreviewSnippet(content), updated_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) throw new Error(`Failed to merge the tabs: ${error.message}`)
  const { error: deleteError } = await supabase.from('document_tabs').delete().eq('document_id', doc.id)
  if (deleteError) fail(deleteError, 'merge the tabs')
  await invalidateDocumentCache(doc.id)
}

/** Add an empty tab after `afterTabId` (or at the end). */
export async function addTab(doc: Document, title: string, afterTabId?: string): Promise<TabSummary> {
  const current = await listTabs(doc.id)
  if (current.length === 0) throw httpError('Split the document into tabs before adding one.', 409, 'document_not_tabbed')
  const after = afterTabId ? current.findIndex((tab) => tab.tab_id === afterTabId) : current.length - 1
  const position = (after < 0 ? current.length - 1 : after) + 1
  const shifted = current.slice(position)
  for (const tab of shifted) {
    const { error } = await supabase.from('document_tabs').update({ position: tab.position + 1 }).eq('tab_id', tab.tab_id)
    if (error) fail(error, 'make room for the tab')
  }
  const { data, error } = await supabase
    .from('document_tabs')
    .insert({
      document_id: doc.id,
      position,
      title: cleanTabTitle(title),
      content: '<p></p>',
      content_json: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) fail(error, 'add the tab')
  await assemble(doc.id)
  return data as TabSummary
}

/** Rename a tab, move it to another place, or set its page numbering. */
export async function updateTab(
  doc: Document,
  tabId: string,
  changes: {
    title?: string
    position?: number
    numbering?: TabNumbering | null
    page_count?: number
    outline?: unknown[] | null
    caption_counts?: Record<string, unknown> | null
  },
): Promise<TabSummary[]> {
  const current = await listTabs(doc.id)
  const index = current.findIndex((tab) => tab.tab_id === tabId)
  if (index < 0) throw httpError('Tab not found', 404)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (changes.title !== undefined) update.title = cleanTabTitle(changes.title)
  if (changes.numbering !== undefined) update.numbering = changes.numbering
  if (changes.page_count !== undefined) update.page_count = Math.max(0, Math.round(changes.page_count))
  if (changes.outline !== undefined) update.outline = changes.outline
  if (changes.caption_counts !== undefined) update.caption_counts = changes.caption_counts
  const { error } = await supabase.from('document_tabs').update(update).eq('tab_id', tabId)
  if (error) fail(error, 'update the tab')

  if (changes.position !== undefined && changes.position !== index) {
    const order = current.map((tab) => tab.tab_id)
    order.splice(index, 1)
    order.splice(Math.max(0, Math.min(order.length, changes.position)), 0, tabId)
    for (const [position, id] of order.entries()) {
      const { error: moveError } = await supabase.from('document_tabs').update({ position }).eq('tab_id', id)
      if (moveError) fail(moveError, 'move the tab')
    }
  }
  // Only a new title or order changes the whole body (its markers); numbering and page counts do not.
  if (changes.title !== undefined || (changes.position !== undefined && changes.position !== index)) await assemble(doc.id)
  return listTabs(doc.id)
}

/**
 * Delete a tab and its text. A version is saved first, so the text can be restored from the
 * history. The last tab cannot be deleted (merge the tabs instead).
 */
export async function deleteTab(doc: Document, tabId: string): Promise<TabSummary[]> {
  const current = await listTabs(doc.id)
  if (!current.some((tab) => tab.tab_id === tabId)) throw httpError('Tab not found', 404)
  if (current.length === 1) throw httpError('A document keeps at least one tab. Merge the tabs instead.', 409, 'last_tab')
  // Always keep the tab as a version before deleting its text (not throttled): restoring it puts
  // the tab back where it was.
  const doomed = await getTab(doc.id, tabId)
  await snapshotTab(doc, doomed, 'before_tab_deleted', true)
  const { error } = await supabase.from('document_tabs').delete().eq('document_id', doc.id).eq('tab_id', tabId)
  if (error) fail(error, 'delete the tab')
  const remaining = current.filter((tab) => tab.tab_id !== tabId)
  for (const [position, tab] of remaining.entries()) {
    if (tab.position === position) continue
    const { error: moveError } = await supabase.from('document_tabs').update({ position }).eq('tab_id', tab.tab_id)
    if (moveError) fail(moveError, 'reorder the tabs')
  }
  await assemble(doc.id)
  return listTabs(doc.id)
}

/**
 * Restore a version of one tab (migration 049): its text replaces the tab's, or, when the tab was
 * deleted since, the tab comes back at its old place. The rest of the document is untouched.
 */
export async function restoreTabVersion(
  doc: Document,
  version: { tab_id: string; tab_title?: string | null; tab_position?: number | null; content: string; content_json?: EditorJson | null },
): Promise<void> {
  const current = await listTabs(doc.id)
  if (current.some((tab) => tab.tab_id === version.tab_id)) {
    await saveTab(doc, version.tab_id, { content: version.content, content_json: version.content_json ?? null })
    return
  }
  await assertWithinStorageQuota(doc.user_id, Buffer.byteLength(version.content))
  const position = Math.max(0, Math.min(current.length, version.tab_position ?? current.length))
  for (const tab of current.slice(position)) {
    const { error } = await supabase.from('document_tabs').update({ position: tab.position + 1 }).eq('tab_id', tab.tab_id)
    if (error) fail(error, 'make room for the tab')
  }
  const { error } = await supabase.from('document_tabs').insert({
    tab_id: version.tab_id,
    document_id: doc.id,
    position,
    title: cleanTabTitle(version.tab_title ?? 'Restored tab'),
    content: version.content,
    content_json: version.content_json ?? null,
    word_count: countBodyWords(version.content),
  })
  if (error) fail(error, 'restore the tab')
  await assemble(doc.id)
  if (position === 0) await refreshPreview(doc.id, version.content)
}
