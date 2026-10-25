import type { ImportJob, ImportJobState } from '@/services/api'

/** Poll cadence for in-flight imports. */
const POLL_INTERVAL_MS = 1500

/** localStorage key holding the ids of imports the user has not dismissed. */
export const IMPORT_STORAGE_KEY = 'intellidocs:import-jobs'

/** One row of the import toast: an upload in flight or a server job. */
export interface TrackedImport {
  /** Job id, or a temporary `upload-N` id until the server accepts the upload. */
  id: string
  fileName: string
  /** `uploading` is client-only; the rest mirror the server job states. */
  state: ImportJobState | 'uploading'
  /** 0-100. */
  progress: number
  error: string
  /** Set once the server has created the document. */
  documentId: string
}

/** The server calls the queue needs; injected so tests can fake them. */
export interface ImportQueueApi {
  queueImport: (file: File) => Promise<{ jobId: string }>
  getJob: (jobId: string) => Promise<ImportJob>
  listJobs: () => Promise<ImportJob[]>
}

/** The slice of localStorage the queue uses. */
export interface ImportQueueStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Whether a tracked import still needs work. */
export function isActive(item: TrackedImport): boolean {
  return item.state !== 'done' && item.state !== 'failed'
}

/** Map an import state to the label shown under the progress bar. */
export function phaseLabel(state: TrackedImport['state'], isDrive = false): string {
  switch (state) {
    case 'uploading':
      return 'Uploading…'
    case 'queued':
      return 'Waiting to start…'
    case 'downloading':
      return isDrive ? 'Downloading from Drive…' : 'Downloading…'
    case 'converting':
      return 'Converting to editable text…'
    case 'done':
      return 'Import complete'
    case 'failed':
      return 'Import failed'
  }
}

/** Convert a server job into a toast row. */
function fromJob(job: ImportJob): TrackedImport {
  return {
    id: job.id,
    fileName: job.fileName,
    state: job.state,
    progress: job.state === 'done' ? 100 : job.progress,
    error: job.state === 'failed' ? job.error : '',
    documentId: job.documentId ?? '',
  }
}

/**
 * Framework-free import queue. It uploads files one at a time, follows the
 * server jobs they create, remembers undismissed job ids so a reload can
 * re-attach, and reports every change through `onChange`.
 */
export class ImportQueue {
  private items: TrackedImport[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private uploadCounter = 0
  private uploadChain: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    private readonly api: ImportQueueApi,
    private readonly storage: ImportQueueStorage,
    private readonly onChange: (items: TrackedImport[]) => void,
    private readonly onJobDone: (item: TrackedImport) => void = () => undefined
  ) {}

  /** Current rows, oldest first. */
  getItems(): TrackedImport[] {
    return this.items
  }

  /** Upload files in order; one failed upload never stops the rest. */
  enqueueFiles(files: File[]): Promise<void> {
    const pending = files.map((file) => {
      this.uploadCounter += 1
      const row: TrackedImport = {
        id: `upload-${this.uploadCounter}`,
        fileName: file.name,
        state: 'uploading',
        progress: 0,
        error: '',
        documentId: '',
      }
      return { file, row }
    })
    this.emit([...this.items, ...pending.map((entry) => entry.row)])

    this.uploadChain = this.uploadChain.then(async () => {
      for (const { file, row } of pending) {
        try {
          const { jobId } = await this.api.queueImport(file)
          this.replace(row.id, { ...row, id: jobId, state: 'queued' })
        } catch (error) {
          this.replace(row.id, {
            ...row,
            state: 'failed',
            error: error instanceof Error ? error.message : 'Upload failed.',
          })
        }
      }
      this.schedulePoll(0)
    })
    return this.uploadChain
  }

  /** Follow a job another part of the app created (for example a Drive import). */
  trackJob(jobId: string, fileName: string): void {
    if (this.items.some((item) => item.id === jobId)) return
    this.emit([
      ...this.items,
      { id: jobId, fileName, state: 'queued', progress: 0, error: '', documentId: '' },
    ])
    this.schedulePoll(0)
  }

  /**
   * Re-attach after a reload: adopt the jobs the server still knows about that
   * are unfinished or were still on the user's undismissed list.
   */
  async reattach(): Promise<void> {
    const remembered = new Set(this.readStoredIds())
    let jobs: ImportJob[]
    try {
      jobs = await this.api.listJobs()
    } catch {
      return
    }
    const known = new Set(this.items.map((item) => item.id))
    const adopted = jobs
      .filter((job) => !known.has(job.id))
      .filter((job) => remembered.has(job.id) || (job.state !== 'done' && job.state !== 'failed'))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(fromJob)
    if (adopted.length === 0) return
    this.emit([...this.items, ...adopted])
    this.schedulePoll(0)
  }

  /** Remove one finished row from the toast. */
  dismiss(id: string): void {
    this.emit(this.items.filter((item) => item.id !== id || isActive(item)))
  }

  /** Remove every finished row from the toast. */
  dismissFinished(): void {
    this.emit(this.items.filter(isActive))
  }

  /** Forget everything (sign-out) and stop polling. */
  reset(): void {
    this.clearTimer()
    this.emit([])
  }

  /** Stop polling for good (provider unmount). */
  dispose(): void {
    this.stopped = true
    this.clearTimer()
  }

  /** Fetch every active job once and fold the results into the rows. */
  async pollOnce(): Promise<void> {
    const active = this.items.filter((item) => isActive(item) && item.state !== 'uploading')
    await Promise.all(
      active.map(async (item) => {
        try {
          const job = await this.api.getJob(item.id)
          this.applyJob(item, fromJob(job))
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          // A job the server no longer has can never finish; anything else is
          // a transient network error that the next tick retries.
          if (/not found/i.test(message)) {
            this.applyJob(item, { ...item, state: 'failed', error: 'This import is no longer available.' })
          }
        }
      })
    )
    if (this.items.some((item) => isActive(item))) this.schedulePoll(POLL_INTERVAL_MS)
  }

  /** Swap a row's data and announce a job that just finished. */
  private applyJob(previous: TrackedImport, next: TrackedImport): void {
    this.replace(previous.id, next)
    if (previous.state !== 'done' && next.state === 'done') this.onJobDone(next)
  }

  /** Replace one row in place. */
  private replace(id: string, next: TrackedImport): void {
    this.emit(this.items.map((item) => (item.id === id ? next : item)))
  }

  /** Publish new rows and persist the ids worth re-attaching to. */
  private emit(items: TrackedImport[]): void {
    this.items = items
    this.writeStoredIds(items.filter((item) => item.state !== 'uploading').map((item) => item.id))
    this.onChange(items)
  }

  /** Arm the poll timer unless one is already waiting. */
  private schedulePoll(delayMs: number): void {
    if (this.stopped || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.pollOnce()
    }, delayMs)
  }

  /** Cancel a pending poll. */
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Read persisted job ids; a missing or corrupt value reads as empty. */
  private readStoredIds(): string[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(IMPORT_STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  /** Persist job ids; storage may be blocked, which only costs re-attach. */
  private writeStoredIds(ids: string[]): void {
    try {
      this.storage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }
}
