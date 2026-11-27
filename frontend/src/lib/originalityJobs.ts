import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api, type WebCheckJobRecord, type WebCheckOptions } from '@/services/api'

interface DocumentJobEntry {
  job: WebCheckJobRecord | null
  starting: boolean
  startError: string | null
  dismissed: boolean
}

const DEFAULT_ENTRY: DocumentJobEntry = {
  job: null,
  starting: false,
  startError: null,
  dismissed: false,
}

const POLL_INTERVAL_MS = 2000
const STORAGE_PREFIX = 'intellidocs:web-check-job:'

const entries = new Map<string, DocumentJobEntry>()
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>()
const hydratedDocs = new Set<string>()
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

function getEntry(documentId: string): DocumentJobEntry {
  if (!documentId) return DEFAULT_ENTRY
  return entries.get(documentId) ?? DEFAULT_ENTRY
}

function persistJob(documentId: string, job: WebCheckJobRecord | null): void {
  if (!documentId || typeof window === 'undefined') return
  try {
    const key = `${STORAGE_PREFIX}${documentId}`
    if (!job) {
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(job))
    }
  } catch {
    // Session storage can be unavailable in restricted contexts.
  }
}

function readPersistedJob(documentId: string): WebCheckJobRecord | null {
  if (!documentId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${documentId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WebCheckJobRecord
    return parsed && typeof parsed.jobId === 'string' ? parsed : null
  } catch {
    return null
  }
}

function setEntry(documentId: string, patch: Partial<DocumentJobEntry>): DocumentJobEntry {
  const prev = getEntry(documentId)
  const next: DocumentJobEntry = { ...prev, ...patch }
  entries.set(documentId, next)
  if ('job' in patch) {
    persistJob(documentId, next.job)
  }
  emitChange()
  return next
}

function stopPolling(documentId: string): void {
  const timer = pollTimers.get(documentId)
  if (timer !== undefined) {
    clearTimeout(timer)
    pollTimers.delete(documentId)
  }
}

function schedulePoll(documentId: string, jobId: string): void {
  stopPolling(documentId)
  const timer = setTimeout(() => {
    pollTimers.delete(documentId)
    void pollOnce(documentId, jobId)
  }, POLL_INTERVAL_MS)
  pollTimers.set(documentId, timer)
}

async function pollOnce(documentId: string, jobId: string): Promise<void> {
  const current = getEntry(documentId).job
  if (current && current.jobId !== jobId) return

  try {
    const updated = await api.plagiarism.getWebCheckJob(jobId)
    // Ignore stale response if a newer job was started while polling.
    const latest = getEntry(documentId).job
    if (latest && latest.jobId !== jobId) return

    setEntry(documentId, {
      job: updated,
      startError: null,
      // Re-open banner when a running job finishes so the user sees completion back in the editor.
      dismissed: updated.status === 'running' ? getEntry(documentId).dismissed : false,
    })

    if (updated.status === 'running') {
      schedulePoll(documentId, jobId)
    } else {
      stopPolling(documentId)
    }
  } catch (err) {
    const status = (err as { status?: number } | null)?.status
    if (status === 404) {
      // Job expired or server restarted; fall back to idle cleanly without leaving a stuck spinner.
      stopPolling(documentId)
      setEntry(documentId, {
        job: null,
        startError: 'Previous originality check expired before completing. Run it again when ready.',
        dismissed: false,
      })
      return
    }
    // Transient network glitch — keep polling so background checks survive temporary blips.
    if (getEntry(documentId).job?.status === 'running') {
      schedulePoll(documentId, jobId)
    }
  }
}

/** Start an async web originality check and keep polling in module scope across navigation. */
export async function startWebOriginalityJob(
  documentId: string,
  options?: WebCheckOptions,
): Promise<WebCheckJobRecord> {
  if (!documentId) {
    throw new Error('Document ID is required')
  }
  stopPolling(documentId)
  setEntry(documentId, { starting: true, startError: null, dismissed: false })

  try {
    const job = await api.plagiarism.startWebCheck(documentId, options)
    hydratedDocs.add(documentId)
    setEntry(documentId, { job, starting: false, startError: null, dismissed: false })
    if (job.status === 'running') {
      schedulePoll(documentId, job.jobId)
    }
    return job
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The online check failed.'
    setEntry(documentId, { starting: false, startError: message })
    throw err
  }
}

/** Hydrate any existing running/completed job from sessionStorage or server once per document load. */
export async function hydrateWebOriginalityJob(documentId: string): Promise<WebCheckJobRecord | null> {
  if (!documentId) return null

  const existing = getEntry(documentId).job
  if (existing?.status === 'running') {
    if (!pollTimers.has(documentId)) schedulePoll(documentId, existing.jobId)
    return existing
  }

  if (hydratedDocs.has(documentId)) {
    return existing
  }
  hydratedDocs.add(documentId)

  const cached = readPersistedJob(documentId)
  if (cached && !existing) {
    setEntry(documentId, { job: cached })
  }

  try {
    const remote = await api.plagiarism.getLatestWebCheck(documentId)
    if (remote) {
      setEntry(documentId, { job: remote, startError: null })
      if (remote.status === 'running') {
        schedulePoll(documentId, remote.jobId)
      }
      return remote
    }
    if (cached?.status === 'running') {
      // Server restarted and no longer has the running job; fetch once by ID or clear stale spinner.
      await pollOnce(documentId, cached.jobId)
    }
    return getEntry(documentId).job
  } catch {
    if (cached?.status === 'running' && !pollTimers.has(documentId)) {
      schedulePoll(documentId, cached.jobId)
    }
    return getEntry(documentId).job
  }
}

/** Hide the floating banner notification in the editor without erasing the stored report. */
export function dismissWebOriginalityNotice(documentId: string): void {
  if (!documentId) return
  setEntry(documentId, { dismissed: true })
}

/** Subscribe to async web originality job state for a document. */
export function useWebOriginalityJob(documentId: string): DocumentJobEntry & {
  startCheck: (options?: WebCheckOptions) => Promise<void>
  dismissNotice: () => void
} {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const snapshot = useSyncExternalStore(subscribe, () => getEntry(documentId), () => DEFAULT_ENTRY)

  useEffect(() => {
    if (!documentId) return
    void hydrateWebOriginalityJob(documentId)
  }, [documentId])

  const startCheck = useCallback(
    async (options?: WebCheckOptions) => {
      await startWebOriginalityJob(documentId, options).catch(() => undefined)
    },
    [documentId],
  )

  const dismissNotice = useCallback(() => {
    dismissWebOriginalityNotice(documentId)
  }, [documentId])

  return {
    ...snapshot,
    startCheck,
    dismissNotice,
  }
}

/** Reset module state between unit tests. */
export function clearOriginalityJobStore(): void {
  for (const timer of pollTimers.values()) clearTimeout(timer)
  pollTimers.clear()
  entries.clear()
  hydratedDocs.clear()
  emitChange()
}
