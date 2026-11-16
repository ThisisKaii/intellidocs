import { randomUUID } from 'crypto'
import type { Document, EditorJson } from '../types/index'
import {
  buildFormatSnapshot,
  canEditDocument,
  contentBytes,
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
  splitBody,
  stripTabBreaks,
  type BodyPart,
} from '../utils/documentTabs'

/**
 * Document tabs (migration 048): each tab's working copy lives in `document_tabs`; the document's
 * own `content`/`content_json` stay the whole body, rebuilt in the database after every change
 * (`assemble_document_tabs`), so everything that reads a document's body keeps working.
 *
 * The rows always mirror the tab markers in the whole body: saving one tab updates its row and
 * rebuilds the body; saving or restoring a whole body re-syncs the rows from its markers.
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

/** Rebuild the whole body from the tabs (in the database), then forget the cached document. */
async function assemble(documentId: string): Promise<void> {
  const { error } = await supabase.rpc('assemble_document_tabs', { p_document_id: documentId })
  if (error) fail(error, 'rebuild the document from its tabs')
  await invalidateDocumentCache(documentId)
}

/** Refresh the grid preview from the first tab's text. */
async function refreshPreview(documentId: string, firstTabHtml: string): Promise<void> {
  await supabase.from('documents').update({ preview_snippet: extractPreviewSnippet(firstTabHtml) }).eq('id', documentId)
}

/** Snapshot the assembled document as a version (throttled, best-effort, copied inside the database). */
async function snapshot(doc: Document, reason: string): Promise<void> {
  try {
    if (!(await versionSnapshotDue(doc.id))) return
    const tabs = await listTabs(doc.id)
    const words = tabs.reduce((sum, tab) => sum + (tab.word_count ?? 0), 0)
    const { error } = await supabase.rpc('snapshot_document_version', {
      p_document_id: doc.id,
      p_reason: reason,
      p_editor_prefs: buildFormatSnapshot(doc),
      p_word_count: words,
    })
    if (error) return
    await markVersionSnapshot(doc.id)
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

  await assemble(doc.id)
  // Positions run 0, 1, 2…: the first tab's text is the grid preview.
  if (existing.position === 0) await refreshPreview(doc.id, input.content)
  void snapshot(doc, 'autosave')
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

  const { error } = await supabase.from('document_tabs').upsert(rows, { onConflict: 'tab_id' })
  if (error) fail(error, 'save the tabs')
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
  const tabs = await syncTabsFromBody(doc, content, contentJson)
  void snapshot(doc, 'tabs_split')
  return tabs
}

/** Put every tab back into one body (the document is then untabbed, as before it was split). */
export async function mergeTabs(doc: Document): Promise<void> {
  const current = await listTabs(doc.id)
  if (current.length === 0) return
  const merged = stripTabBreaks(doc.content ?? '', doc.content_json ?? null)
  const { error: deleteError } = await supabase.from('document_tabs').delete().eq('document_id', doc.id)
  if (deleteError) fail(deleteError, 'merge the tabs')
  const { error } = await supabase
    .from('documents')
    .update({ content: merged.content, content_json: merged.content_json, preview_snippet: extractPreviewSnippet(merged.content) })
    .eq('id', doc.id)
  if (error) throw new Error(`Failed to merge the tabs: ${error.message}`)
  await invalidateDocumentCache(doc.id)
  void snapshot(doc, 'tabs_merged')
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
  try {
    // Always snapshot before deleting text (not throttled).
    await supabase.rpc('snapshot_document_version', {
      p_document_id: doc.id,
      p_reason: 'before_tab_deleted',
      p_editor_prefs: buildFormatSnapshot(doc),
      p_word_count: current.reduce((sum, tab) => sum + (tab.word_count ?? 0), 0),
    })
  } catch {
    /* best-effort */
  }
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
