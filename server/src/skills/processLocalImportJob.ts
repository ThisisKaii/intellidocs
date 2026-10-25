import { readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { createImportJob, failImportJob, updateImportJob, type ImportJob } from '../models/importJobModel'
import { importLocalFile } from './importLocalFile'

/** Where a local job's uploaded bytes wait until it is their turn to convert. */
export function localUploadPath(jobId: string): string {
  return path.join(os.tmpdir(), `intellidocs-upload-${jobId}`)
}

/** Per-user tail of the work chain, so one user's batch converts one file at a time. */
const userChains = new Map<string, Promise<void>>()

/** Progress shown while the converter and document save run. */
const CONVERTING_PROGRESS = 20
const SAVING_PROGRESS = 90

/**
 * Convert one stored upload into a document and record the outcome on the job.
 * Never throws: every failure lands on the job so the client sees a terminal state.
 */
export async function processLocalImportJob(job: ImportJob): Promise<void> {
  const filePath = localUploadPath(job.id)
  try {
    await updateImportJob(job.id, { state: 'converting', progress: CONVERTING_PROGRESS })
    const buffer = await readFile(filePath)
    const document = await importLocalFile(job.userId, { buffer, originalname: job.fileName })
    await updateImportJob(job.id, { state: 'converting', progress: SAVING_PROGRESS })
    await updateImportJob(job.id, {
      state: 'done',
      progress: 100,
      title: document.title,
      documentId: document.id,
    })
  } catch (error) {
    await failImportJob(job.id, error instanceof Error ? error.message : String(error))
  } finally {
    await rm(filePath, { force: true }).catch(() => undefined)
  }
}

/**
 * Store an upload, create its job and convert it in the background (after the
 * user's earlier imports). Returns at once so the HTTP request ends quickly and
 * the import carries on when the user navigates away.
 */
export async function enqueueLocalImport(
  userId: string,
  file: { buffer: Buffer; originalname: string }
): Promise<ImportJob> {
  const job = await createImportJob(userId, '', file.originalname, 'local')
  try {
    await writeFile(localUploadPath(job.id), file.buffer)
  } catch (error) {
    await failImportJob(job.id, 'Could not store the uploaded file.')
    throw error
  }

  const previous = userChains.get(userId) ?? Promise.resolve()
  const next = previous.then(() => processLocalImportJob(job))
  userChains.set(userId, next)
  void next.finally(() => {
    if (userChains.get(userId) === next) userChains.delete(userId)
  })
  return job
}
