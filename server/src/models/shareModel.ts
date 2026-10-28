import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DocumentShare } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Shape of a resolved share (owner + collaborator emails for display). */
export interface ShareWithDetails extends DocumentShare {
  owner_email?: string
  collaborator_email?: string | null
  collaborator_display_name?: string | null
}

/** Shape of a document's copyable share link. */
export interface ShareLink {
  share_token: string | null
  share_permission: 'view' | 'comment' | 'edit'
  share_expires_at: string | null
  /** The short code that goes with the link, or null when there is none (or migration 035 is not applied). */
  share_code: string | null
}

const LINK_COLUMNS = 'share_token, share_permission, share_expires_at'

/** PostgREST/Postgres error codes for an unknown column (migration 035 not applied yet). */
const UNDEFINED_COLUMN_CODES = ['42703', 'PGRST204']

/** True when the error means `share_code` does not exist yet. */
function isMissingCodeColumn(error: { code?: string } | null): boolean {
  return Boolean(error?.code && UNDEFINED_COLUMN_CODES.includes(error.code))
}

/** A share link row as the API returns it, with the code always present (null when unavailable). */
function toShareLink(row: Partial<ShareLink>): ShareLink {
  return {
    share_token: row.share_token ?? null,
    share_permission: row.share_permission ?? 'view',
    share_expires_at: row.share_expires_at ?? null,
    share_code: row.share_code ?? null,
  }
}

/** Whether an optional UTC expiry timestamp has already passed. */
export function isShareLinkExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now
}

/** Read the current share link token for an owner's document, if any. */
export async function getShareLink(documentId: string): Promise<ShareLink | null> {
  let { data, error } = await supabase
    .from('documents')
    .select(`${LINK_COLUMNS}, share_code`)
    .eq('id', documentId)
    .single()
  if (isMissingCodeColumn(error)) {
    ;({ data, error } = await supabase.from('documents').select(LINK_COLUMNS).eq('id', documentId).single())
  }
  if (error) throw new Error(`Failed to get share link: ${error.message}`)
  return toShareLink(data as Partial<ShareLink>)
}

/**
 * Mint or replace a document's share token (owner only). Pass `code` to set the short code that goes
 * with the link; leave it out to keep the current one.
 */
export async function upsertShareLink(
  documentId: string,
  token: string,
  permission: 'view' | 'comment' | 'edit',
  expiresAt: string | null,
  code?: string,
): Promise<ShareLink> {
  const base = { share_token: token, share_permission: permission, share_expires_at: expiresAt }
  let { data, error } = await supabase
    .from('documents')
    .update(code === undefined ? base : { ...base, share_code: code })
    .eq('id', documentId)
    .select(`${LINK_COLUMNS}, share_code`)
    .single()
  if (isMissingCodeColumn(error)) {
    ;({ data, error } = await supabase.from('documents').update(base).eq('id', documentId).select(LINK_COLUMNS).single())
  }
  if (error) throw new Error(`Failed to create share link: ${error.message}`)
  return toShareLink(data as Partial<ShareLink>)
}

/** Remove a document's share token and code, disabling the link (owner only). */
export async function revokeShareLink(documentId: string): Promise<void> {
  const base = { share_token: null, share_permission: 'view', share_expires_at: null }
  let { error } = await supabase.from('documents').update({ ...base, share_code: null }).eq('id', documentId)
  if (isMissingCodeColumn(error)) {
    ;({ error } = await supabase.from('documents').update(base).eq('id', documentId))
  }
  if (error) throw new Error(`Failed to revoke share link: ${error.message}`)
}

/** Higher number = more access. */
const PERMISSION_RANK = { view: 0, comment: 1, edit: 2 } as const

/** An error with the HTTP status the controller should answer with. */
export class ShareCodeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ShareCodeError'
  }
}

/** What joining with a code did. */
export interface CodeJoinResult {
  documentId: string
  title: string
  permission: 'view' | 'comment' | 'edit'
  /** True when the user already had access, so nothing new was added. */
  alreadyShared: boolean
}

/**
 * Add the document behind a share code to the user's "Shared with me", with the link's permission.
 * The code must belong to a live (not trashed, not expired) link of someone else's document. A user
 * who already has access keeps it, upgraded if the code grants more.
 */
export async function joinByShareCode(userId: string, code: string, now: number = Date.now()): Promise<CodeJoinResult> {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, user_id, title, is_deleted, share_token, share_permission, share_expires_at')
    .eq('share_code', code)
    .maybeSingle()
  if (isMissingCodeColumn(error)) throw new ShareCodeError('Codes are not available yet', 503)
  if (error) throw new Error(`Failed to look up the code: ${error.message}`)
  if (!doc || doc.is_deleted || !doc.share_token || isShareLinkExpired(doc.share_expires_at, now)) {
    throw new ShareCodeError('That code is not valid or has expired', 404)
  }
  if (doc.user_id === userId) throw new ShareCodeError('This is your own document', 400)

  const granted = doc.share_permission as 'view' | 'comment' | 'edit'
  const { data: existing, error: existingError } = await supabase
    .from('document_shares')
    .select('share_id, permission')
    .eq('document_id', doc.id)
    .eq('shared_with', userId)
    .limit(1)
  if (existingError) throw new Error(`Failed to check existing access: ${existingError.message}`)

  const current = existing?.[0] as { share_id: string; permission: 'view' | 'comment' | 'edit' } | undefined
  if (current) {
    const permission = PERMISSION_RANK[granted] > PERMISSION_RANK[current.permission] ? granted : current.permission
    if (permission !== current.permission) await updateSharePermission(current.share_id, permission)
    return { documentId: doc.id, title: doc.title, permission, alreadyShared: true }
  }
  await createShare(doc.id, doc.user_id, userId, null, granted)
  return { documentId: doc.id, title: doc.title, permission: granted, alreadyShared: false }
}

/** List all shares for a given document as the owner. */
export async function getDocumentShares(documentId: string): Promise<ShareWithDetails[]> {
  const { data, error } = await supabase
    .from('document_shares')
    .select('*')
    .eq('document_id', documentId)
  if (error) throw new Error(`Failed to get shares: ${error.message}`)
  return data || []
}

/** Create a share, either to an existing user id or via a pending email. */
export async function createShare(
  documentId: string,
  ownerId: string,
  collaboratorId: string | null,
  pendingEmail: string | null,
  permission: 'view' | 'comment' | 'edit',
): Promise<DocumentShare> {
  const { data, error } = await supabase
    .from('document_shares')
    .insert({
      document_id: documentId,
      owner_id: ownerId,
      shared_with: collaboratorId,
      pending_email: pendingEmail,
      permission,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to create share: ${error.message}`)
  return data!
}

/** Update the permission of an existing share (owner only). */
export async function updateSharePermission(
  shareId: string,
  permission: 'view' | 'comment' | 'edit',
): Promise<DocumentShare> {
  const { data, error } = await supabase
    .from('document_shares')
    .update({ permission })
    .eq('share_id', shareId)
    .select()
    .single()
  if (error) throw new Error(`Failed to update share: ${error.message}`)
  return data!
}

/** Remove a share entirely (owner only). */
export async function deleteShare(shareId: string): Promise<void> {
  const { error } = await supabase
    .from('document_shares')
    .delete()
    .eq('share_id', shareId)
  if (error) throw new Error(`Failed to delete share: ${error.message}`)
}

/** Resolve pending email shares for a freshly-registered user. Caller passes their email + id. */
export async function resolvePendingShares(
  collaboratorId: string,
  collaboratorEmail: string,
): Promise<void> {
  const { error } = await supabase
    .from('document_shares')
    .update({ shared_with: collaboratorId, pending_email: null })
    .eq('pending_email', collaboratorEmail)
    .is('shared_with', null)
  if (error) throw new Error(`Failed to resolve pending shares: ${error.message}`)
}

/** List shares where the user is the collaborator but still pending an email match. */
export async function getPendingSharesForEmail(email: string): Promise<DocumentShare[]> {
  const { data, error } = await supabase
    .from('document_shares')
    .select('*')
    .eq('pending_email', email)
    .is('shared_with', null)
  if (error) throw new Error(`Failed to fetch pending shares: ${error.message}`)
  return data || []
}

/** Check whether a user has any access role on a document (owner or active collaborator). */
export async function resolvePendingSharesByUser(
  userId: string,
  email: string,
): Promise<void> {
  const pending = await getPendingSharesForEmail(email)
  if (pending.length === 0) return
  const { error } = await supabase
    .from('document_shares')
    .update({ shared_with: userId, pending_email: null })
    .in(
      'share_id',
      pending.map((s) => s.share_id),
    )
  if (error) throw new Error(`Failed to resolve pending shares: ${error.message}`)
}