import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { resolvePendingSharesByUser } from '../models/shareModel'
import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'
import { importLocalFile } from '../skills/importLocalFile'
import { enqueueLocalImport } from '../skills/processLocalImportJob'
import { validateImportUpload } from '../skills/validateImportUpload'
import { getImportJob, listUserImportJobs, settleStaleJob } from '../models/importJobModel'

/** Return the version history for a document (owner only, newest first). */
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
    const versions = await documentModel.getDocumentVersions(id, userId)
    res.json(versions)
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

    const document = await documentModel.getDocumentForUser(
      id,
      userId,
      req.user?.email,
      typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined,
    )
    res.status(200).json(document)
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
      res.status(status).json({ error: (error as Error).message })
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
      res.status(201).json(await importLocalFile(userId, file))
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
    const url = await documentModel.uploadDocumentImage(userId, req.file)
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
