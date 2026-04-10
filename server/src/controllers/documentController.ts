import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'

export async function getAllDocuments(req: Request, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) {

      res.status(401).json({error: 'Unauthorized'})
      return
    }
    const documents = await documentModel.getDocuments(userId)
    res.json(documents)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({error: 'Internal server error'})
  }
}

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

    const document = await documentModel.getDocumentById(id, userId)
    res.status(200).json(document)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}

export async function createDocument(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as CreateDocumentRequest
    if (!userId) {
      res.status(401).json({error: 'Unauthorized'})
      return
    }

    if (!body.title) {
      res.status(400).json({error: 'Title is required'})
      return
    }

    const document = await documentModel.createDocument(userId, body)
    res.status(201).json(document)

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({error: 'Internal server error'})
  }
}

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

    const document = await documentModel.updateDocument(id, userId, body)
    res.status(200).json(document)

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({error: 'Internal server error'})
  }
}

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

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({error: 'Internal server error'})
  }
}
