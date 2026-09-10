import { Request, Response } from 'express'
import crypto from 'node:crypto'
import * as documentModel from '../models/documentModel'
import * as shareModel from '../models/shareModel'
import { supabase } from '../models/documentModel'
import type { SharePermission } from '../types/index'

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

    const { permission } = req.body as { permission?: SharePermission }
    if (!permission || !['view', 'comment', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Valid permission value is required' }); return
    }

    const doc = await documentModel.getDocumentById(id, userId)
    if (doc.user_id !== userId) { res.status(403).json({ error: 'Forbidden' }); return }

    const token = crypto.randomBytes(24).toString('base64url')
    const link = await shareModel.upsertShareLink(id, token, permission)
    res.status(201).json(link)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
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