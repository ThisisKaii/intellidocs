import { Request, Response } from 'express'
import * as documentModel from '../models/documentModel'
import { resolvePendingSharesByUser } from '../models/shareModel'
import { CreateDocumentRequest, PageNumberFormat, UpdateDocumentRequest } from '../types/index'
import { requestDocumentConversion } from '../ai/bridge/pythonBridge'
import { sanitizeImportedHtml } from '../skills/sanitizeImportedHtml'
import path from 'path'

/** The slice of the pdf-parse v2 class API this controller uses. */
interface PdfParser {
  getText: () => Promise<{ text: string }>
  destroy: () => Promise<void>
}

/**
 * Load pdf-parse on first use. It costs ~0.5s to import and only PDF imports
 * need it, so loading it eagerly slowed every dev-server start and restart.
 */
function createPdfParser(data: Buffer): PdfParser {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PDFParse } = require('pdf-parse') as {
    PDFParse: new (options: { data: Buffer }) => PdfParser
  }
  return new PDFParse({ data })
}

/** Maximum length of a PDF line that may be promoted to a heading. */
const PDF_HEADING_MAX_CHARS = 80
/** Standard heading shapes: Chapter/Section starts and numbered sections. */
const PDF_CHAPTER_HEADING_RE = /^(?:chapter|section|part|appendix|unit|module)s?\b/i
const PDF_NUMBERED_HEADING_RE = /^\d+(?:\.\d+)+\.?(?:\s|$)/
const PDF_ALL_CAPS_RE = /^[A-Z][A-Z0-9 &:'’-]*[A-Z]$/
/** Words a wrapped sentence line may trail off with. */
const PDF_CONTINUATION_TAIL_RE =
  /\b(in|of|and|the|with|that|to|for|by|on|at|as|or|but|a|an|from|into|over|under|between|among|is|are|was|were|be|been)\s*$/i
const PDF_TITLE_CONNECTORS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
])

/** True when every word is Capitalized, an acronym, a number, or a connector. */
function isTitleCaseHeading(line: string): boolean {
  const words = line.replace(/\.$/, '').split(/\s+/)
  if (words.length === 0 || words.length > 8) return false
  return words.every((word): boolean => {
    const core = word.replace(/^[("'’[]+|[)\],:;'"’\-–—]+$/g, '')
    if (!core) return true
    return (
      PDF_TITLE_CONNECTORS.has(core) ||
      core === core.toUpperCase() ||
      /^\d+$/.test(core) ||
      /^[A-Z][a-z'’-]*$/.test(core)
    )
  })
}

/** Classify one short PDF line as a heading level, or null for body text. */
function classifyPdfHeading(line: string): 'h1' | 'h2' | null {
  if (PDF_CHAPTER_HEADING_RE.test(line)) return 'h1'
  if (/^\d+\.\s+\S/.test(line)) return 'h1'
  if (PDF_NUMBERED_HEADING_RE.test(line)) return 'h2'
  if (PDF_ALL_CAPS_RE.test(line) && /[A-Z]{2}/.test(line)) return 'h1'
  if (isTitleCaseHeading(line)) return 'h2'
  return null
}

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
    let headerNumberFormat: PageNumberFormat = 'none'
    let footerNumberFormat: PageNumberFormat = 'none'
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
          headerNumberFormat = pyResult.header_number_format ?? 'none'
          footerNumberFormat = pyResult.footer_number_format ?? 'none'
          pageSetup = pyResult.page_setup
        }
      } catch (pyError) {
        console.warn('Python converter service unavailable, falling back to local converter:', pyError)
      }
    }

    if (!htmlContent && effectiveExt === '.docx') {
      // Fallback: Convert DOCX → HTML via Mammoth with table border preservation.
      // Loaded on demand: mammoth is only needed when the Python converter fails.
      const mammoth = await import('mammoth')
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
      const parser = createPdfParser(file.buffer)
      const result = await parser.getText()
      await parser.destroy()
      const text = result.text || ''

      // Structure text into headings, paragraphs, and lists. A line only
      // becomes a heading when it is short, follows a standard heading shape,
      // does not trail off mid-sentence, and the next line starts a new
      // sentence; unfinished lines are joined onto the previous paragraph.
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const htmlBlocks: string[] = []

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i]
        const nextLine = lines[i + 1] ?? ''

        const escaped = trimmed
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

        const isHeadingCandidate =
          trimmed.length <= PDF_HEADING_MAX_CHARS &&
          !/^[a-z]/.test(nextLine) &&
          !PDF_CONTINUATION_TAIL_RE.test(trimmed) &&
          !/[,\-–—;(]$/.test(trimmed)
        const heading = isHeadingCandidate ? classifyPdfHeading(trimmed) : (null as 'h1' | 'h2' | null)

        if (heading === 'h1') {
          htmlBlocks.push(`<h1>${escaped}</h1>`)
        } else if (heading === 'h2') {
          htmlBlocks.push(`<h2>${escaped}</h2>`)
        } else if (/^[\bullet\-\*•]\s+/.test(trimmed)) {
          htmlBlocks.push(`<ul><li>${escaped.replace(/^[\bullet\-\*•]\s+/, '')}</li></ul>`)
        } else {
          const prev = htmlBlocks[htmlBlocks.length - 1]
          const prevText =
            prev !== undefined && prev.startsWith('<p>') ? prev.replace(/<[^>]*>/g, '').trim() : ''
          const prevTerminated = /[.!?:]\s*$/.test(prevText.replace(/["'”’)\]]+$/, ''))
          if (prev !== undefined && prevText && !prevTerminated) {
            // Previous paragraph lacked terminal punctuation: join this line on.
            htmlBlocks[htmlBlocks.length - 1] = `${prev.slice(0, -4)} ${escaped}</p>`
          } else {
            htmlBlocks.push(`<p>${escaped}</p>`)
          }
        }
      }

      htmlContent = htmlBlocks.join('\n')
    }

    // Create the document with the converted content, page setup, and header/footer
    const document = await documentModel.createDocument(userId, {
      title,
      unique_title: true,
      content: sanitizeImportedHtml(htmlContent),
      header_content: headerContent,
      footer_content: footerContent,
      // Word's header/footer exists on the page; turn the editor's on whenever
      // the file had text or a PAGE field there (page numbers are re-created by
      // the editor, not stored as the frozen number Word last saved).
      show_header: headerContent !== '' || headerNumberFormat !== 'none',
      show_footer: footerContent !== '' || footerNumberFormat !== 'none',
      header_number_format: headerNumberFormat,
      footer_number_format: footerNumberFormat,
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
