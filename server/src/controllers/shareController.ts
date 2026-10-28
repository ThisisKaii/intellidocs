import { Request, Response } from 'express'
import crypto from 'node:crypto'
import * as documentModel from '../models/documentModel'
import * as shareModel from '../models/shareModel'
import { supabase } from '../models/documentModel'
import type { SharePermission } from '../types/index'
import { generateShareCode, normalizeShareCode } from '../utils/shareCode'
import { allowAttempt } from '../utils/attemptLimit'

/** Wrong code entries allowed per person in each window; the code space is huge, this stops guessing. */
const JOIN_ATTEMPTS_PER_WINDOW = 10
const JOIN_WINDOW_SECONDS = 15 * 60

/** Get all shares for a document (owner only). */
export async function getSharesForDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id)   { res.status(400).json({ error: 'Document ID is required' }); return }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    const shares = await shareModel.getDocumentShares(id)
    res.json(shares)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/**
 * Create a share to a user's email. The share is either active (user already
 * exists) or pending (user still needs to register). Lookup via Supabase Auth
 * admin API.
 */
export async function createShare(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id)   { res.status(400).json({ error: 'Document ID is required' }); return }

    const { email, permission } = req.body as { email?: string; permission?: SharePermission }
    if (!email || !permission) { res.status(400).json({ error: 'Email and permission are required' }); return }
    if (!['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Invalid permission value' }); return
    }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    // Try to find the target user via Supabase Auth (email-based lookup).
    const { data: authList, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) throw new Error(`Failed to look up users: ${listError.message}`)

    const targetUser = (authList?.users ?? []).find((u) => u.email === email)
    const share = await shareModel.createShare(
      id,
      userId,
      targetUser?.id ?? null,
      targetUser ? null : email,
      permission,
    )
    res.status(201).json(share)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Update the permission level of an existing share (owner only). */
export async function updateShare(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { shareId } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!shareId) { res.status(400).json({ error: 'Share ID is required' }); return }

    const { permission } = req.body as { permission?: SharePermission }
    if (!permission || !['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Valid permission value is required' }); return
    }

    const share = await shareModel.updateSharePermission(shareId, permission)
    res.json(share)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Remove a share entirely (owner only). */
export async function deleteShare(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { shareId } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!shareId) { res.status(400).json({ error: 'Share ID is required' }); return }

    await shareModel.deleteShare(shareId)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Get the current copyable share link for a document (owner only). */
export async function getShareLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id) { res.status(400).json({ error: 'Document ID is required' }); return }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    const link = await shareModel.getShareLink(id)
    res.json(link)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Mint or replace a document's copyable share link (owner only). */
export async function createShareLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id) { res.status(400).json({ error: 'Document ID is required' }); return }

    const { permission, expiresAt } = req.body as {
      permission?: SharePermission
      expiresAt?: string | null
    }
    if (!permission || !['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Valid permission value is required' }); return
    }
    const expiry = parseExpiry(expiresAt)
    if (expiry === 'invalid') {
      res.status(400).json({ error: 'Invalid expiry value' }); return
    }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    res.status(201).json(await mintLinkWithCode(id, permission, expiry))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Run an action that stores a fresh code; a clash with another document's code (practically never) retries. */
async function withUniqueCode<T>(store: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await store(generateShareCode())
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('duplicate key'))) throw error
    }
  }
  throw new Error('Could not create a unique share code')
}

/** Create (or replace) a document's share link together with a fresh short code. */
async function mintLinkWithCode(documentId: string, permission: SharePermission, expiry: string | null): Promise<shareModel.ShareLink> {
  const token = crypto.randomBytes(24).toString('base64url')
  return withUniqueCode((code) => shareModel.upsertShareLink(documentId, token, permission, expiry, code))
}

/**
 * Generate a new short code for a document (owner only). If the document already has a share link the
 * link is kept and only the code is replaced; otherwise a link is created with the code, using the
 * permission and expiry sent (view and no expiry by default).
 */
export async function createShareCode(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id) { res.status(400).json({ error: 'Document ID is required' }); return }

    const { permission = 'view', expiresAt } = req.body as { permission?: SharePermission; expiresAt?: string | null }
    if (!['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Valid permission value is required' }); return
    }
    const expiry = parseExpiry(expiresAt)
    if (expiry === 'invalid') {
      res.status(400).json({ error: 'Invalid expiry value' }); return
    }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    const current = await shareModel.getShareLink(id)
    const link = current?.share_token
      ? await withUniqueCode((code) => shareModel.setShareCode(id, code))
      : await mintLinkWithCode(id, permission, expiry)
    res.status(201).json(link)
  } catch (error) {
    if (error instanceof shareModel.ShareCodeError) {
      res.status(error.status).json({ error: error.message }); return
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Update an existing share link's permission or expiry (owner only, keeps token). */
export async function updateShareLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id) { res.status(400).json({ error: 'Document ID is required' }); return }

    const { permission, expiresAt } = req.body as {
      permission?: SharePermission
      expiresAt?: string | null
    }
    if (permission !== undefined && !['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Valid permission value is required' }); return
    }
    const expiry = parseExpiry(expiresAt)
    if (expiry === 'invalid') {
      res.status(400).json({ error: 'Invalid expiry value' }); return
    }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    const current = await shareModel.getShareLink(id)
    if (!current?.share_token) {
      res.status(400).json({ error: 'No share link exists yet' }); return
    }

    const nextPermission = permission ?? current.share_permission
    const nextExpiry = expiry ?? current.share_expires_at
    const link = await shareModel.upsertShareLink(id, current.share_token, nextPermission, nextExpiry)
    res.json(link)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Validate an optional expiry value; returns 'invalid', null, or an ISO string. */
function parseExpiry(expiresAt: string | null | undefined): string | null | 'invalid' {
  if (expiresAt === undefined || expiresAt === null || expiresAt === '') return null
  const ts = new Date(expiresAt).getTime()
  if (Number.isNaN(ts)) return 'invalid'
  if (ts <= Date.now()) return 'invalid'
  return new Date(ts).toISOString()
}

/** Disable a document's copyable share link (owner only). */
export async function revokeShareLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!id) { res.status(400).json({ error: 'Document ID is required' }); return }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    await shareModel.revokeShareLink(id)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

/** Add the document behind a short share code to the caller's "Shared with me". */
export async function joinWithCode(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }

    const code = normalizeShareCode((req.body as { code: string }).code)
    if (!code) { res.status(400).json({ error: 'Enter the 8-character code, for example K7M2-QX9P' }); return }

    if (!(await allowAttempt(`join-code:${userId}`, JOIN_ATTEMPTS_PER_WINDOW, JOIN_WINDOW_SECONDS))) {
      res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' })
      return
    }

    res.json(await shareModel.joinByShareCode(userId, code))
  } catch (error) {
    if (error instanceof shareModel.ShareCodeError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}
