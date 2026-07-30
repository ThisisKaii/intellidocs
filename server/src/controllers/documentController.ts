import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'
import mammoth from 'mammoth'
import path from 'path'
// pdf-parse is a CommonJS module; access .default when loaded via tsx/ESM interop
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse')
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> =
  typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default


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

    const document = await documentModel.getDocumentById(id, userId)
    res.status(200).json(document)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
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
  } catch {
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

    const document = await documentModel.updateDocument(id, userId, body)
    res.status(200).json(document)
  } catch {
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

    const ext = path.extname(file.originalname).toLowerCase()
    const allowedExtensions = ['.docx', '.txt', '.html', '.htm', '.pdf']

    if (!allowedExtensions.includes(ext)) {
      res.status(400).json({
        error: `Unsupported file type "${ext}". Allowed: .docx, .txt, .html, .pdf`,
      })
      return
    }

    // Derive document title from filename (strip extension)
    const title = path.basename(file.originalname, ext) || 'Imported Document'

    let htmlContent = ''

    if (ext === '.docx') {
      // Convert Word document to clean semantic HTML via mammoth
      const result = await mammoth.convertToHtml({ buffer: file.buffer })
      htmlContent = result.value
    } else if (ext === '.txt') {
      // Wrap each line of plain text in a <p> tag
      const text = file.buffer.toString('utf-8')
      htmlContent = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n')
    } else if (ext === '.html' || ext === '.htm') {
      // Use HTML content directly — strip <html>/<head>/<body> wrapper if present
      const rawHtml = file.buffer.toString('utf-8')
      const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      htmlContent = bodyMatch ? bodyMatch[1].trim() : rawHtml
    } else if (ext === '.pdf') {
      // Extract plain text from PDF using pdf-parse
      const pdfData = await pdfParse(file.buffer)
      const text = pdfData.text
      htmlContent = text
        .split(/\r?\n/)
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n')
    }

    // Create the document with the converted content
    const document = await documentModel.createDocument(userId, { title, content: htmlContent })
    res.status(201).json(document)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    res.status(500).json({ error: message })
  }
}
