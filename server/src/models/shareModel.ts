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
}

/** Whether an optional UTC expiry timestamp has already passed. */
export function isShareLinkExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now
}

/** Read the current share link token for an owner's document, if any. */
export async function getShareLink(documentId: string): Promise<ShareLink | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('share_token, share_permission, share_expires_at')
    .eq('id', documentId)
    .single()
  if (error) throw new Error(`Failed to get share link: ${error.message}`)
  return data as ShareLink
}

/** Mint or replace a document's share token (owner only). */
export async function upsertShareLink(
  documentId: string,
  token: string,
  permission: 'view' | 'comment' | 'edit',
  expiresAt: string | null,
): Promise<ShareLink> {
  const { data, error } = await supabase
    .from('documents')
    .update({ share_token: token, share_permission: permission, share_expires_at: expiresAt })
    .eq('id', documentId)
    .select('share_token, share_permission, share_expires_at')
    .single()
  if (error) throw new Error(`Failed to create share link: ${error.message}`)
  return data as ShareLink
}

/** Remove a document's share token, disabling the link (owner only). */
export async function revokeShareLink(documentId: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ share_token: null, share_permission: 'view', share_expires_at: null })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to revoke share link: ${error.message}`)
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