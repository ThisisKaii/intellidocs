import type { Request, Response } from 'express'
import * as documentTabModel from '../models/documentTabModel'
import type { AddTabInput, SaveTabInput, SplitTabsInput, UpdateTabInput } from '../../schemas/documentSchemas'
import type { EditorJson } from '../types/index'

/**
 * Document tabs (migration 048): list, read and save single tabs; split a document into tabs,
 * merge them back, add, rename, move, renumber and delete tabs. The document's whole body is kept
 * up to date by the model after every change.
 */

interface Caller {
  userId: string
  email: string | undefined
  shareToken: string | undefined
}

function caller(req: Request, res: Response): Caller | null {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return {
    userId,
    email: req.user?.email,
    shareToken: typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined,
  }
}

/** Answer with the status and code a model error carries (403, 404, 409, 413, 503), else 500. */
function sendError(res: Response, error: unknown): void {
  const { status, code, message } = error as { status?: number; code?: string; message?: string }
  if (status && status >= 400 && status < 600 && status !== 500) {
    res.status(status).json({ error: message ?? 'Request failed', ...(code ? { code } : {}) })
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}

/** The document (access-checked). Only split and merge need its body; the rest read settings. */
async function loadDocument(req: Request, res: Response, needEdit: boolean, withBody = false) {
  const who = caller(req, res)
  if (!who) return null
  return documentTabModel.documentForTabs(req.params.id, who.userId, who.email, who.shareToken, needEdit, withBody)
}

/** GET /documents/:id/tabs — the tabs without their bodies. */
export async function listTabs(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, false)
    if (!doc) return
    res.status(200).json({ tabs: await documentTabModel.listTabs(doc.id) })
  } catch (error) {
    sendError(res, error)
  }
}

/** GET /documents/:id/tabs/:tabId — one tab with its body. */
export async function getTab(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, false)
    if (!doc) return
    res.status(200).json(await documentTabModel.getTab(doc.id, req.params.tabId))
  } catch (error) {
    sendError(res, error)
  }
}

/** PUT /documents/:id/tabs/:tabId — save the open tab. */
export async function saveTab(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true)
    if (!doc) return
    const body = req.body as SaveTabInput
    const tab = await documentTabModel.saveTab(doc, req.params.tabId, {
      content: body.content,
      content_json: (body.content_json ?? null) as EditorJson | null,
      page_count: body.page_count,
      caption_counts: body.caption_counts,
      outline: body.outline,
    })
    res.status(200).json(tab)
  } catch (error) {
    sendError(res, error)
  }
}

/** POST /documents/:id/tabs/split — split a document into tabs (its body with tab markers). */
export async function splitTabs(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true, true)
    if (!doc) return
    const body = req.body as SplitTabsInput
    const tabs = await documentTabModel.splitDocument(doc, body.content, (body.content_json ?? null) as EditorJson | null)
    res.status(200).json({ tabs })
  } catch (error) {
    sendError(res, error)
  }
}

/** POST /documents/:id/tabs/merge — put every tab back into one body. */
export async function mergeTabs(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true, true)
    if (!doc) return
    await documentTabModel.mergeTabs(doc)
    res.status(200).json({ tabs: [] })
  } catch (error) {
    sendError(res, error)
  }
}

/** POST /documents/:id/tabs — add an empty tab. */
export async function addTab(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true)
    if (!doc) return
    const body = req.body as AddTabInput
    const tab = await documentTabModel.addTab(doc, body.title, body.afterTabId)
    res.status(201).json(tab)
  } catch (error) {
    sendError(res, error)
  }
}

/** PATCH /documents/:id/tabs/:tabId — rename, move or renumber a tab. */
export async function updateTab(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true)
    if (!doc) return
    const body = req.body as UpdateTabInput
    res.status(200).json({ tabs: await documentTabModel.updateTab(doc, req.params.tabId, body) })
  } catch (error) {
    sendError(res, error)
  }
}

/** DELETE /documents/:id/tabs/:tabId — delete a tab (a version is saved first). */
export async function deleteTab(req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadDocument(req, res, true)
    if (!doc) return
    res.status(200).json({ tabs: await documentTabModel.deleteTab(doc, req.params.tabId) })
  } catch (error) {
    sendError(res, error)
  }
}
