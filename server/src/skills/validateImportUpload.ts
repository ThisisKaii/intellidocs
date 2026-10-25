import path from 'path'

/** The slice of an uploaded file the import pipeline needs. */
export interface ImportUpload {
  buffer: Buffer
  originalname: string
}

/** What validation learned about an acceptable upload. */
export interface ValidatedImport {
  /** Extension to convert by; a renamed .docx (ZIP) reports '.docx'. */
  effectiveExt: string
  /** Document title derived from the filename without its extension. */
  title: string
}

const ALLOWED_EXTENSIONS = ['.docx', '.doc', '.txt', '.html', '.htm', '.pdf']

/** Build an error carrying the HTTP status the controller should answer with. */
function badRequest(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 })
}

/**
 * Check an upload's extension and magic bytes before any conversion work.
 * Legacy OLE2 .doc files are rejected; a .doc that is really a ZIP is treated
 * as .docx. Throws a 400-tagged error for anything unsupported.
 */
export function validateImportUpload(file: ImportUpload): ValidatedImport {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw badRequest(`Unsupported file type "${ext}". Allowed: .docx, .doc, .txt, .html, .pdf`)
  }

  // Magic bytes distinguish .docx (ZIP) from legacy .doc (OLE2).
  const header = file.buffer.subarray(0, 8)
  const isZip = header[0] === 0x50 && header[1] === 0x4B // PK\x03\x04
  const isOLE2 = header[0] === 0xD0 && header[1] === 0xCF && header[2] === 0x11 && header[3] === 0xE0

  if (ext === '.doc' && isOLE2) {
    throw badRequest(
      'Legacy .doc format is not supported. Please open the file in Microsoft Word and save it as .docx, or use LibreOffice to convert it. Supported formats: .docx, .txt, .html, .pdf'
    )
  }

  return {
    effectiveExt: ext === '.doc' && isZip ? '.docx' : ext,
    title: path.basename(file.originalname, ext) || 'Imported Document',
  }
}
