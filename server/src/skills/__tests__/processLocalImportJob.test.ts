import type { ImportJob } from '../../models/importJobModel'

const jobs = new Map<string, ImportJob>()
const importLocalFile = jest.fn()

jest.mock('../../models/importJobModel', () => ({
  createImportJob: async (userId: string, fileId: string, fileName: string, source: string) => {
    const job = {
      id: `job-${jobs.size + 1}`, userId, source, fileId, fileName, progress: 0, state: 'queued',
      title: '', html: '', error: '', documentId: '', createdAt: 1, updatedAt: 1,
    }
    jobs.set(job.id, job as ImportJob)
    return job
  },
  updateImportJob: async (id: string, patch: Partial<ImportJob>) => {
    jobs.set(id, { ...(jobs.get(id) as ImportJob), ...patch })
  },
  failImportJob: async (id: string, error: string) => {
    jobs.set(id, { ...(jobs.get(id) as ImportJob), state: 'failed', error, progress: 0 })
  },
}))
jest.mock('../importLocalFile', () => ({
  importLocalFile: (...args: unknown[]) => importLocalFile(...args),
}))

import { existsSync } from 'fs'
import { enqueueLocalImport, localUploadPath, processLocalImportJob } from '../processLocalImportJob'

/** Wait until a job reaches a terminal state. */
async function settled(id: string): Promise<ImportJob> {
  for (let i = 0; i < 100; i += 1) {
    const job = jobs.get(id) as ImportJob
    if (job.state === 'done' || job.state === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('job never finished')
}

describe('enqueueLocalImport', () => {
  beforeEach(() => {
    jobs.clear()
    importLocalFile.mockReset()
  })

  it('returns a queued local job immediately and records the new document id on finish', async () => {
    importLocalFile.mockResolvedValue({ id: 'doc-9', title: 'Thesis' })
    const job = await enqueueLocalImport('u1', { buffer: Buffer.from('hi'), originalname: 'Thesis.docx' })

    expect(job.source).toBe('local')
    expect(job.state).toBe('queued')

    const done = await settled(job.id)
    expect(done.state).toBe('done')
    expect(done.progress).toBe(100)
    expect(done.documentId).toBe('doc-9')
    expect(importLocalFile).toHaveBeenCalledWith('u1', expect.objectContaining({ originalname: 'Thesis.docx' }))
    expect(existsSync(localUploadPath(job.id))).toBe(false)
  })

  it('marks the job failed with the error and keeps later files going', async () => {
    importLocalFile.mockRejectedValueOnce(new Error('converter down')).mockResolvedValueOnce({ id: 'doc-2', title: 'B' })
    const first = await enqueueLocalImport('u1', { buffer: Buffer.from('a'), originalname: 'A.pdf' })
    const second = await enqueueLocalImport('u1', { buffer: Buffer.from('b'), originalname: 'B.pdf' })

    expect((await settled(first.id)).error).toBe('converter down')
    expect((await settled(second.id)).documentId).toBe('doc-2')
  })

  it('converts one user’s files one at a time', async () => {
    let running = 0
    let peak = 0
    importLocalFile.mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
      return { id: 'd', title: 't' }
    })
    const a = await enqueueLocalImport('u2', { buffer: Buffer.from('a'), originalname: 'A.txt' })
    const b = await enqueueLocalImport('u2', { buffer: Buffer.from('b'), originalname: 'B.txt' })
    await settled(a.id)
    await settled(b.id)
    expect(peak).toBe(1)
  })

  it('fails a job whose stored upload is missing', async () => {
    const job = { id: 'job-x', userId: 'u1', fileName: 'Gone.docx' } as ImportJob
    jobs.set(job.id, { ...job, state: 'queued' } as ImportJob)
    await processLocalImportJob(job)
    expect(jobs.get('job-x')?.state).toBe('failed')
  })
})
