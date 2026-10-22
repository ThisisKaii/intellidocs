import { createReadStream } from 'fs'
import { rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import type { drive_v3 } from 'googleapis/build/src/apis/drive'
import * as driveModel from '../models/driveModel'
import {
  createImportJob,
  failImportJob,
  updateImportJob,
  type ImportJob,
} from '../models/importJobModel'
import {
  requestDocumentConversion,
  requestDocumentConversionFromPath,
  parseDocument,
} from '../ai/bridge/pythonBridge'
import {
  streamToFileWithProgress,
  type DownloadStream,
} from './streamDownload'
import { rtfToParagraphs, textToHtml } from './driveTextExtract'
import { sanitizeImportedHtml } from './sanitizeImportedHtml'

/** Files at or below this size convert in one shot; larger ones are queued. */
export const LARGE_FILE_BYTES = 15 * 1024 * 1024

/** The googleapis Drive client type, aliased so the helper signature stays readable. */
type DriveClient = drive_v3.Drive

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Progress bands: the download owns 0-70 and conversion starts at 70, so a
 * multi-hundred-megabyte download still leaves a visible remainder for the
 * convert step rather than jumping straight to done.
 */
const DOWNLOAD_SHARE = 70
const CONVERT_START = 70

/** Resolve the Google Drive client for a user, refreshing tokens as needed. */
async function getDriveClient(userId: string): Promise<DriveClient> {
  return driveModel.getDriveClient(userId)
}

/** Rebuild a filename whose extension matches the declared MIME type. */
function conversionFilename(title: string, mimeType: string): string {
  const lower = title.toLowerCase()
  if (mimeType === DOCX_MIME && !lower.endsWith('.docx')) return `${title}.docx`
  if (mimeType === 'application/pdf' && !lower.endsWith('.pdf')) return `${title}.pdf`
  return title
}

/**
 * Convert a downloaded file to HTML, falling back through Mammoth (docx),
 * RTF/text extraction, and a hard error for PDF.
 *
 * `readFile` is only invoked for files already known to be in memory; the
 * streaming callers pass a path so a large document is never fully buffered.
 */
async function convertToHtml(args: {
  filePath: string
  title: string
  mimeType: string
  buffer: Buffer | null
}): Promise<{ html: string; converterError: string | null }> {
  const { filePath, title, mimeType, buffer } = args
  const readBuffered = async (): Promise<Buffer> =>
    buffer ? buffer : await createReadStream(filePath).toArray().then((chunks) => Buffer.concat(chunks))

  let converterError: string | null = null
  let html = ''
  try {
    const pyResult = buffer
      ? await requestDocumentConversion(buffer, conversionFilename(title, mimeType))
      : await requestDocumentConversionFromPath(filePath, conversionFilename(title, mimeType))
    if (pyResult?.html) html = pyResult.html
  } catch (error) {
    converterError = error instanceof Error ? error.message : String(error)
  }

  if (!html && (mimeType === DOCX_MIME || /\.docx$/i.test(title))) {
    const { convertToHtml: mammothConvert } = await import('mammoth')
    const result = buffer
      ? await mammothConvert({ buffer })
      : await mammothConvert({ path: filePath })
    html = result.value
  } else if (!html && (mimeType === 'application/msword' || /\.doc$/i.test(title))) {
    throw new Error(
      'Legacy .doc format is not supported. Please open the file in Microsoft Word or Google Docs and save it as .docx, then import again.'
    )
  } else if (!html && mimeType === 'application/rtf') {
    html = rtfToParagraphs(await readBuffered())
  } else if (!html && mimeType === 'text/plain') {
    html = textToHtml((await readBuffered()).toString('utf-8'))
  } else if (!html && /\.pdf$/i.test(title)) {
    // The legacy converter may not handle complex layouts; try the marker/opendataloader
    // parse pipeline (multi-column + tables + equations) before refusing the file.
    try {
      const parsed = buffer
        ? await parseDocument({ buffer, filename: conversionFilename(title, mimeType), mimetype: mimeType })
        : await parseDocument({ buffer: await readBuffered(), filename: conversionFilename(title, mimeType), mimetype: mimeType })
      if (parsed?.html) html = parsed.html
    } catch (parseError) {
      const parseMsg = parseError instanceof Error ? parseError.message : String(parseError)
      throw new Error(
        converterError
          ? `Document conversion service unavailable (${converterError}; parse: ${parseMsg}).`
          : `This PDF could not be converted (${parseMsg}).`
      )
    }
  } else if (!html) {
    html = textToHtml((await readBuffered()).toString('utf-8'))
  }

  return { html, converterError }
}

/**
 * Run one import job end to end: stream the file to disk, convert it, and
 * record the outcome on the job. Never throws — every failure is captured on
 * the job so the polling client sees a terminal state instead of hanging.
 */
export async function processImportJob(job: ImportJob): Promise<void> {
  const tempPath = path.join(os.tmpdir(), `intellidocs-import-${job.id}`)

  try {
    await updateImportJob(job.id, { state: 'downloading', progress: 0 })

    const drive = await getDriveClient(job.userId)
    const meta = await drive.files.get({ fileId: job.fileId, fields: 'name, mimeType' })
    const title = meta.data.name ?? job.fileName
    const mimeType = meta.data.mimeType ?? ''

    const downloaded = await drive.files.get(
      { fileId: job.fileId, alt: 'media' },
      { responseType: 'stream' }
    )

    await streamToFileWithProgress(downloaded.data as DownloadStream, tempPath, (percent) => {
      void updateImportJob(job.id, {
        state: 'downloading',
        progress: Math.round((percent * DOWNLOAD_SHARE) / 100),
      })
    })

    await updateImportJob(job.id, { state: 'converting', progress: CONVERT_START })
    const { html } = await convertToHtml({ filePath: tempPath, title, mimeType, buffer: null })

    await updateImportJob(job.id, {
      state: 'done',
      progress: 100,
      title,
      html: sanitizeImportedHtml(html),
    })
  } catch (error) {
    await failImportJob(
      job.id,
      error instanceof Error ? error.message : String(error)
    )
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined)
  }
}

/**
 * Enqueue a large-file import and start processing it in the background.
 * Returns immediately so the HTTP request is never held open for the download.
 */
export async function enqueueImportJob(
  userId: string,
  fileId: string,
  fileName: string
): Promise<ImportJob> {
  const job = await createImportJob(userId, fileId, fileName)
  // Deliberately not awaited: the client polls Redis for status instead.
  void processImportJob(job)
  return job
}
