import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import * as documentTabModel from '../models/documentTabModel'
import { hasTabBreaks } from '../utils/documentTabs'
import { resolvePendingSharesByUser } from '../models/shareModel'
import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'
import { importLocalFile } from '../skills/importLocalFile'
import { canUsePreset, PRESET_LOCKED_CODE } from '../skills/canUsePreset'
import { assertWithinStorageQuota, getOwnRoleStatus } from '../models/userModel'
import { getOwnerOfDocument } from '../models/formattingModel'

import { enqueueLocalImport } from '../skills/processLocalImportJob'
import { validateImportUpload } from '../skills/validateImportUpload'
import { cancelImportJob as cancelJob, getImportJob, listUserImportJobs, settleStaleJob } from '../models/importJobModel'

/** A document id as the client sends it with an upload. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Return the version history for a document (owner only, newest first). */
/** One version with its body (the history list leaves bodies out). */
export async function getDocumentVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id, versionId } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id || !versionId || !/^[0-9a-f-]{36}$/i.test(versionId)) {
      res.status(400).json({ error: 'Document and version IDs are required' })
      return
    }
    res.json(await documentModel.getDocumentVersion(id, userId, versionId))
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    res.status(status ?? 500).json({ error: (error as Error).message })
  }
}

export async function getDocumentVersions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }
    // A tabbed document's history is read one tab at a time (?tab=<tab id>).
    const tab = typeof req.query.tab === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.tab) ? req.query.tab : undefined
    const versions = await documentModel.getDocumentVersions(id, userId, tab)
    res.json(versions)
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    res.status(status ?? 500).json({ error: (error as Error).message })
  }
}

/**
 * Save the document (or, for a tabbed document, the open tab) as a named version now: the
 * assistant does this before a change it applies, so History can go back to just before it.
 */
export async function createDocumentCheckpoint(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { reason, tabId } = req.body as { reason: string; tabId?: string }
    const doc = await documentModel.checkpointDocumentVersion(id, userId, reason)
    if (hasTabBreaks(doc.content) && tabId) await documentTabModel.checkpointTab(doc, tabId, reason)
    res.status(201).json({ ok: true })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    res.status(status ?? 500).json({ error: (error as Error).message })
  }
}

/** Restore a specific version snapshot onto the document (owner only). */
export async function restoreDocumentVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id, versionId } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id || !versionId) {
      res.status(400).json({ error: 'Document ID and version ID are required' })
      return
    }
    const restored = await documentModel.restoreDocumentVersion(id, versionId, userId)
    res.json(restored)
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    res.status(status ?? 500).json({ error: (error as Error).message })
  }
}


/** Return all documents owned by the authenticated user. */
export async function getAllDocuments(req: Request, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const documents = await documentModel.getDocuments(userId)
    res.json(documents)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Return documents shared to the authenticated user (active non-deleted). */
export async function getSharedDocuments(req: Request, res: Response) {
  try {
    const userId = req.user?.id
    const userEmail = req.user?.email
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Lazily resolve shares that were pending on this email before listing.
    if (userEmail) {
      await resolvePendingSharesByUser(userId, userEmail)
    }

    const documents = await documentModel.getSharedDocuments(userId)
    res.json(documents)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Return documents currently in the trash (soft-deleted, owned by the user). */
export async function getTrashDocuments(req: Request, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const documents = await documentModel.getTrashDocuments(userId)
    res.json(documents)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Soft-delete a document (move to trash). */
export async function trashDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }
    await documentModel.softDeleteDocument(id, userId)
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Restore a document from trash. */
export async function restoreTrashDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }
    await documentModel.restoreDocument(id, userId)
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Permanently delete a document from trash. */
export async function purgeTrashDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }
    await documentModel.purgeDocument(id, userId)
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Return a single document by ID, scoped to the authenticated user. */
export async function getDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    const shareToken = typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined
    const document = await documentModel.getDocumentForUser(id, userId, req.user?.email, shareToken)
    // Whether this caller may save: a reviewing professor can read a submission but not edit it,
    // so the client opens it read-only instead of showing an editor whose saves would be refused.
    const canEdit = await documentModel.canEditDocument(document, userId, shareToken)
    // A document split into chapter tabs lists them (without their bodies); [] for every other document.
    const tabs = hasTabBreaks(document.content) ? await documentTabModel.listTabs(document.id) : []
    res.status(200).json({ ...document, can_edit: canEdit, tabs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = (error as Error & { status?: number }).status ?? 500
    res.status(status).json({ error: message })
  }
}

/** Create a blank new document for the authenticated user. */
export async function createDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as CreateDocumentRequest
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!body.title) {
      res.status(400).json({ error: 'Title is required' })
      return
    }

    if (body.formatting_preset && !canUsePreset((await getOwnRoleStatus(userId)).role, body.formatting_preset)) {
      res.status(403).json({ error: 'Thesis presets require verified student status.', code: PRESET_LOCKED_CODE })
      return
    }

    const document = await documentModel.createDocument(userId, body)
    res.status(201).json(document)
  } catch (error) {
    if ((error as { status?: number }).status === 413) {
      res.status(413).json({ error: (error as Error).message, code: 'storage_quota_exceeded' })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Update an existing document. */
export async function updateDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const body = req.body as UpdateDocumentRequest

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    const shareToken = typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined
    const document = await documentModel.updateDocument(id, userId, body, shareToken)
    res.status(200).json(document)
  } catch (error) {
    // Model errors that carry an HTTP status (403 no access, 409 blocked
    // destructive overwrite) keep it instead of collapsing into a 500.
    const status = (error as { status?: number }).status
    if (status === 403 || status === 409) {
      const code = (error as { code?: string }).code
      res.status(status).json({ error: (error as Error).message, ...(code ? { code } : {}) })
      return
    }
    if (status === 413) {
      res.status(413).json({ error: (error as Error).message, code: 'storage_quota_exceeded' })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Delete a document owned by the authenticated user. */
export async function deleteDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const { id } = req.params

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!id) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    await documentModel.deleteDocument(id, userId)
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * Import a local file (.docx, .txt, .html, .pdf) and create a new document.
 * Converts the file to HTML content before saving.
 * Legacy .doc (OLE2 binary) files are rejected with a helpful message.
 */
export async function importDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    // The editor's in-document import needs the document back in this response.
    if (req.query.sync === '1') {
      // The editor's Cancel drops the request: a document made after that is nobody's to open.
      let abandoned = false
      res.on('close', () => {
        if (!res.writableFinished) abandoned = true
      })
      const document = await importLocalFile(userId, file)
      if (abandoned) {
        await documentModel.purgeDocument(document.id, userId).catch(() => undefined)
        return
      }
      res.status(201).json(document)
      return
    }

    // Reject unsupported files now; the real conversion runs in the background.
    validateImportUpload(file)
    const job = await enqueueLocalImport(userId, file)
    res.status(202).json({ jobId: job.id, state: job.state, fileName: job.fileName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    if ((error as { status?: number }).status === 400) {
      res.status(400).json({ error: message })
      return
    }
    if ((error as { status?: number }).status === 413) {
      res.status(413).json({ error: message, code: 'storage_quota_exceeded' })
      return
    }
    res.status(500).json({ error: message })
  }
}

/** Upload an editor image to storage and return its public URL. */
export async function uploadImage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' })
      return
    }
    // Pictures count toward storage like text does: refuse one that would pass the cap.
    await assertWithinStorageQuota(userId, req.file.buffer.length)
    // Stored as the open document's picture when the uploader owns it, so deleting the document
    // frees it; otherwise (a shared document, no document) it stays the uploader's own picture.
    const documentId = typeof req.body?.documentId === 'string' && UUID.test(req.body.documentId) ? req.body.documentId : null
    const ownDocument = documentId && (await getOwnerOfDocument(documentId)) === userId ? documentId : null
    const url = await documentModel.uploadDocumentImage(userId, req.file, ownDocument)
    res.status(201).json({ url })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    res.status(status ?? 500).json({ error: (error as Error).message })
  }
}

/** Return one of the caller's import jobs (stale unfinished jobs report as failed). */
export async function getImportJobStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const job = await getImportJob(req.params.jobId)
    if (!job || job.userId !== userId) {
      res.status(404).json({ error: 'Import job not found' })
      return
    }
    res.status(200).json(settleStaleJob(job))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** Cancel one of the caller's unfinished imports; a finished one can no longer be cancelled (409). */
export async function cancelImportJob(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const job = await getImportJob(req.params.jobId)
    if (!job || job.userId !== userId) {
      res.status(404).json({ error: 'Import job not found' })
      return
    }
    if (job.state === 'done') {
      res.status(409).json({ error: 'This import already finished.' })
      return
    }
    if (job.state === 'failed') {
      res.status(200).json(job)
      return
    }
    res.status(200).json(await cancelJob(job.id))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** List the caller's recent import jobs, newest first, so a reloaded client can re-attach. */
export async function listImportJobs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const jobs = await listUserImportJobs(userId)
    res.status(200).json({ jobs: jobs.map(settleStaleJob) })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
