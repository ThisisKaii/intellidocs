import { Request, Response } from 'express'
import * as folderModel from '../models/folderModel'

interface FolderBody {
  name?: string
}

interface FolderDocumentBody {
  documentId?: string
}

/** Read the authenticated user id from the request. */
function getUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  return userId
}

/** List top-level folders for the current user. */
export async function getFolders(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const folders = await folderModel.getFolders(userId)
    res.status(200).json(folders)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load folders'
    res.status(500).json({ error: message })
  }
}

/** Create a new top-level folder. */
export async function createFolder(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const { name } = req.body as FolderBody
    if (!name) {
      res.status(400).json({ error: 'Folder name is required' })
      return
    }

    const folder = await folderModel.createFolder(userId, name.trim())
    res.status(201).json(folder)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create folder'
    res.status(500).json({ error: message })
  }
}

/** Rename an existing folder. */
export async function renameFolder(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Folder ID is required' })
      return
    }

    const current = await folderModel.getFolderById(userId, id)
    if (current.name === 'My Drive') {
      res.status(400).json({ error: 'My Drive cannot be renamed' })
      return
    }

    const { name } = req.body as FolderBody
    if (!name) {
      res.status(400).json({ error: 'Folder name is required' })
      return
    }

    const folder = await folderModel.renameFolder(userId, id, name.trim())
    res.status(200).json(folder)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rename folder'
    res.status(500).json({ error: message })
  }
}

/** Delete a folder (except My Drive). */
export async function deleteFolder(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Folder ID is required' })
      return
    }

    const current = await folderModel.getFolderById(userId, id)
    if (current.name === 'My Drive') {
      res.status(400).json({ error: 'My Drive cannot be deleted' })
      return
    }

    await folderModel.deleteFolder(userId, id)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete folder'
    res.status(500).json({ error: message })
  }
}

/** List documents inside a folder. */
export async function getFolderDocuments(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Folder ID is required' })
      return
    }

    const documents = await folderModel.getDocumentsForFolder(userId, id)
    res.status(200).json(documents)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load folder documents'
    res.status(500).json({ error: message })
  }
}

/** Assign a document to the requested folder. */
export async function addDocumentToFolder(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Folder ID is required' })
      return
    }

    const { documentId } = req.body as FolderDocumentBody
    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    await folderModel.assignDocumentToFolder(userId, documentId, id)
    res.status(200).json({ status: 'ok' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to move document'
    res.status(500).json({ error: message })
  }
}
