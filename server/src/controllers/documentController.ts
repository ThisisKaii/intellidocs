import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'
import { requestDocumentConversion } from '../ai/bridge/pythonBridge'
import mammoth from 'mammoth'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (options: { data: Buffer }) => {
    getText: () => Promise<{ text: string }>
    destroy: () => Promise<void>
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

    const ext = path.extname(file.originalname).toLowerCase()
    const allowedExtensions = ['.docx', '.doc', '.txt', '.html', '.htm', '.pdf']

    if (!allowedExtensions.includes(ext)) {
      res.status(400).json({
        error: `Unsupported file type "${ext}". Allowed: .docx, .doc, .txt, .html, .pdf`,
      })
      return
    }

    // Magic byte detection: check file signature to distinguish .docx (ZIP) from .doc (OLE2)
    const header = file.buffer.subarray(0, 8)
    const isZip = header[0] === 0x50 && header[1] === 0x4B // PK\x03\x04
    const isOLE2 = header[0] === 0xD0 && header[1] === 0xCF && header[2] === 0x11 && header[3] === 0xE0

    // Legacy .doc (OLE2 binary) is not supported — reject with actionable message
    if (ext === '.doc' && isOLE2) {
      res.status(400).json({
        error: 'Legacy .doc format is not supported. Please open the file in Microsoft Word and save it as .docx, or use LibreOffice to convert it. Supported formats: .docx, .txt, .html, .pdf',
      })
      return
    }

    // If extension is .doc but file is actually a ZIP (renamed .docx), treat as .docx
    const effectiveExt = ext === '.doc' && isZip ? '.docx' : ext

    // Derive document title from filename (strip extension)
    const title = path.basename(file.originalname, ext) || 'Imported Document'

    let htmlContent = ''
    let headerContent = ''
    let footerContent = ''
    let pageSetup: {
      page_size: 'short' | 'long' | 'a4' | 'letter' | 'legal'
      orientation: 'portrait' | 'landscape'
      margins: { top: number; bottom: number; left: number; right: number }
    } | undefined

    // Try Python microservice for high-fidelity conversion (tables, images, typography, layout)
    if (effectiveExt === '.docx' || effectiveExt === '.pdf') {
      try {
        const pyResult = await requestDocumentConversion(file.buffer, file.originalname)
        if (pyResult && pyResult.html) {
          htmlContent = pyResult.html
          headerContent = pyResult.header ?? ''
          footerContent = pyResult.footer ?? ''
          pageSetup = pyResult.page_setup
        }
      } catch (pyError) {
        console.warn('Python converter service unavailable, falling back to local converter:', pyError)
      }
    }

    if (!htmlContent && effectiveExt === '.docx') {
      // Fallback: Convert DOCX → HTML via Mammoth with table border preservation
      const result = await mammoth.convertToHtml(
        { buffer: file.buffer },
        {
          convertImage: (mammoth.images as any).imgElement((element: any) => {
            return element.read('base64').then((imageBuffer: string) => ({
              src: `data:${element.contentType};base64,${imageBuffer}`,
            }))
          }),
          styleMap: [
            "u => u",
            "strike => s",
            "sub => sub",
            "sup => sup",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Heading 5'] => h5:fresh",
            "p[style-name='Heading 6'] => h6:fresh",
            "p[style-name='Title'] => h1.title:fresh",
            "p[style-name='Subtitle'] => h2.subtitle:fresh",
            "table => table:split-column-widths",
            "tr => tr",
            "td:split-column-widths => td",
            "th:split-column-widths => th",
          ],
        }
      )
      htmlContent = result.value

      // Post-process: add table border CSS if Mammoth didn't preserve borders
      if (htmlContent.includes('<table') && !htmlContent.includes('border-collapse')) {
        htmlContent = htmlContent.replace(
          /<table(?![^>]*style)/g,
          '<table style="border-collapse:collapse; width:100%; margin:1em 0; border:1px solid var(--border);"'
        )
        htmlContent = htmlContent.replace(
          /<(td|th)(?![^>]*style)/g,
          '<$1 style="border:1px solid var(--border); padding:6px 10px;"'
        )
      }
    } else if (effectiveExt === '.txt') {
      // Wrap each line of plain text in a <p> tag
      const text = file.buffer.toString('utf-8')
      htmlContent = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n')
    } else if (effectiveExt === '.html' || effectiveExt === '.htm') {
      // Use HTML content directly — strip <html>/<head>/<body> wrapper if present
      const rawHtml = file.buffer.toString('utf-8')
      const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      htmlContent = bodyMatch ? bodyMatch[1].trim() : rawHtml
    } else if (!htmlContent && effectiveExt === '.pdf') {
      // Extract plain text from PDF using pdf-parse v2 class API with structure preservation
      const parser = new PDFParse({ data: file.buffer })
      const result = await parser.getText()
      await parser.destroy()
      const text = result.text || ''

      // Structure text into headings, paragraphs, and lists
      const lines = text.split(/\r?\n/)
      const htmlBlocks: string[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const escaped = trimmed
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

        // Detect Heading 1: Short uppercase/title lines or Chapter/Section starts
        if (
          (trimmed.length < 60 && /^(CHAPTER|SECTION|\d+\.|\d+\s+[A-Z])/i.test(trimmed)) ||
          (trimmed.length < 45 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))
        ) {
          htmlBlocks.push(`<h1>${escaped}</h1>`)
        }
        // Detect Heading 2: Sub-headings (e.g., 1.1, 2.3) or short titlecase lines ending without punctuation
        else if (
          (trimmed.length < 60 && /^\d+\.\d+\s+/.test(trimmed)) ||
          (trimmed.length < 40 && !/[.:;,]$/.test(trimmed) && /^[A-Z][a-zA-B0-9\s]+$/.test(trimmed))
        ) {
          htmlBlocks.push(`<h2>${escaped}</h2>`)
        }
        // Detect Bullet points
        else if (/^[\bullet\-\*•]\s+/.test(trimmed)) {
          htmlBlocks.push(`<ul><li>${escaped.replace(/^[\bullet\-\*•]\s+/, '')}</li></ul>`)
        }
        // Standard paragraph
        else {
          htmlBlocks.push(`<p>${escaped}</p>`)
        }
      }

      htmlContent = htmlBlocks.join('\n')
    }

    // Create the document with the converted content, page setup, and header/footer
    const document = await documentModel.createDocument(userId, {
      title,
      content: htmlContent,
      header_content: headerContent,
      footer_content: footerContent,
      page_size: pageSetup?.page_size,
      margins: pageSetup?.margins,
      orientation: pageSetup?.orientation,
    })
    res.status(201).json(document)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    res.status(500).json({ error: message })
  }
}
