import { describe, expect, it, vi } from 'vitest'
import type { ImportJob } from '@/services/api'
import { IMPORT_STORAGE_KEY, ImportQueue, type ImportQueueApi, type TrackedImport } from './importQueue'

/** Build a server job with sensible defaults. */
function job(overrides: Partial<ImportJob>): ImportJob {
  return {
    id: 'j1', source: 'local', fileId: '', fileName: 'a.docx', progress: 0, state: 'queued',
    title: '', html: '', error: '', documentId: '', createdAt: 1, updatedAt: 1, ...overrides,
  }
}

/** In-memory localStorage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value },
    data,
  }
}

/** Build a queue wired to fake api calls and capture its rows. */
function setup(api: Partial<ImportQueueApi>, storage = memoryStorage(), onJobDone = vi.fn()) {
  const rows: { current: TrackedImport[] } = { current: [] }
  const full: ImportQueueApi = {
    queueImport: vi.fn(),
    getJob: vi.fn(),
    listJobs: vi.fn().mockResolvedValue([]),
    ...api,
  }
  const queue = new ImportQueue(full, storage, (items) => { rows.current = items }, onJobDone)
  return { queue, rows, storage, onJobDone, api: full }
}

const file = (name: string): File => new File(['x'], name)

describe('ImportQueue', () => {
  it('uploads files in order and a failed upload does not skip the rest', async () => {
    const queueImport = vi.fn()
      .mockRejectedValueOnce(new Error('Unsupported file type'))
      .mockResolvedValueOnce({ jobId: 'job-b' })
    const { queue, rows } = setup({ queueImport })

    await queue.enqueueFiles([file('a.exe'), file('b.docx')])
    queue.dispose()

    expect(rows.current.map((r) => [r.fileName, r.state])).toEqual([['a.exe', 'failed'], ['b.docx', 'queued']])
    expect(rows.current[0].error).toBe('Unsupported file type')
    expect(rows.current[1].id).toBe('job-b')
  })

  it('persists job ids but not in-flight uploads', async () => {
    const { queue, storage } = setup({ queueImport: vi.fn().mockResolvedValue({ jobId: 'job-1' }) })
    await queue.enqueueFiles([file('a.docx')])
    queue.dispose()
    expect(JSON.parse(storage.data[IMPORT_STORAGE_KEY])).toEqual(['job-1'])
  })

  it('follows progress, records the document and announces completion once', async () => {
    const getJob = vi.fn()
      .mockResolvedValueOnce(job({ id: 'job-1', state: 'converting', progress: 20 }))
      .mockResolvedValueOnce(job({ id: 'job-1', state: 'done', progress: 100, documentId: 'doc-7' }))
    const { queue, rows, onJobDone } = setup({ getJob })
    queue.trackJob('job-1', 'a.docx')
    queue.dispose()

    await queue.pollOnce()
    expect(rows.current[0]).toMatchObject({ state: 'converting', progress: 20 })
    await queue.pollOnce()
    expect(rows.current[0]).toMatchObject({ state: 'done', documentId: 'doc-7' })
    await queue.pollOnce()
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(onJobDone).toHaveBeenCalledTimes(1)
  })

  it('keeps a failure visible until dismissed', async () => {
    const getJob = vi.fn().mockResolvedValue(job({ id: 'job-1', state: 'failed', error: 'converter down' }))
    const { queue, rows } = setup({ getJob })
    queue.trackJob('job-1', 'a.docx')
    queue.dispose()
    await queue.pollOnce()

    expect(rows.current[0]).toMatchObject({ state: 'failed', error: 'converter down' })
    queue.dismiss('job-1')
    expect(rows.current).toEqual([])
  })

  it('does not dismiss a row that is still running', () => {
    const { queue, rows } = setup({})
    queue.trackJob('job-1', 'a.docx')
    queue.dispose()
    queue.dismiss('job-1')
    expect(rows.current).toHaveLength(1)
  })

  it('re-attaches to unfinished jobs and to remembered finished ones, skipping dismissed ones', async () => {
    const listJobs = vi.fn().mockResolvedValue([
      job({ id: 'running', state: 'converting', createdAt: 2 }),
      job({ id: 'finished-remembered', state: 'done', documentId: 'doc-1', createdAt: 1 }),
      job({ id: 'finished-dismissed', state: 'done', createdAt: 3 }),
    ])
    const storage = memoryStorage({ [IMPORT_STORAGE_KEY]: JSON.stringify(['finished-remembered']) })
    const { queue, rows } = setup({ listJobs, getJob: vi.fn().mockResolvedValue(job({ id: 'running', state: 'converting' })) }, storage)

    await queue.reattach()
    queue.dispose()

    expect(rows.current.map((r) => r.id)).toEqual(['finished-remembered', 'running'])
    expect(rows.current[0]).toMatchObject({ state: 'done', documentId: 'doc-1' })
  })

  it('marks a job the server forgot as failed instead of polling forever', async () => {
    const getJob = vi.fn().mockRejectedValue(new Error('Import job not found'))
    const { queue, rows } = setup({ getJob })
    queue.trackJob('gone', 'a.docx')
    queue.dispose()
    await queue.pollOnce()
    expect(rows.current[0].state).toBe('failed')
  })

  it('keeps retrying through a transient network error', async () => {
    const getJob = vi.fn().mockRejectedValue(new Error('Network error: unable to reach the server.'))
    const { queue, rows } = setup({ getJob })
    queue.trackJob('job-1', 'a.docx')
    queue.dispose()
    await queue.pollOnce()
    expect(rows.current[0].state).toBe('queued')
  })
})
