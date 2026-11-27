import { randomUUID } from 'node:crypto'
import type { WebOriginalityResult } from '../skills/runWebOriginalityCheck'

export type WebCheckJobStatus = 'running' | 'completed' | 'failed'

export interface WebCheckJobPublic {
  jobId: string
  documentId: string
  status: WebCheckJobStatus
  scopeLabel: string
  result?: WebOriginalityResult
  error?: string
  startedAt: string
  updatedAt: string
}

interface StoredWebCheckJob extends WebCheckJobPublic {
  userId: string
  expiresAt: number
}

const JOB_TTL_MS = 30 * 60 * 1000

const jobs = new Map<string, StoredWebCheckJob>()
const latestByUserDoc = new Map<string, string>()

function pruneExpiredJobs(now = Date.now()): void {
  for (const [jobId, job] of jobs.entries()) {
    if (job.expiresAt <= now) {
      jobs.delete(jobId)
      const docKey = `${job.userId}:${job.documentId}`
      if (latestByUserDoc.get(docKey) === jobId) {
        latestByUserDoc.delete(docKey)
      }
    }
  }
}

function toPublicJob(job: StoredWebCheckJob): WebCheckJobPublic {
  return {
    jobId: job.jobId,
    documentId: job.documentId,
    status: job.status,
    scopeLabel: job.scopeLabel,
    ...(job.result !== undefined ? { result: job.result } : {}),
    ...(job.error !== undefined ? { error: job.error } : {}),
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  }
}

/** Format a concise human-readable label for the selected originality scope. */
export function formatWebCheckScopeLabel(options: {
  scope?: 'all' | 'chapter' | 'pages'
  chapterTitle?: string
  pageStart?: number
  pageEnd?: number
}): string {
  if (options.scope === 'chapter' && options.chapterTitle) {
    return `Chapter "${options.chapterTitle}"`
  }
  if (options.scope === 'pages') {
    const start = options.pageStart ?? 1
    const end = options.pageEnd ?? start
    return `Pages ${start}–${end}`
  }
  return 'Entire document'
}

/** Create and track a new async web originality check job for one user + document. */
export function createWebCheckJob(input: {
  userId: string
  documentId: string
  scopeLabel: string
}): WebCheckJobPublic {
  const now = Date.now()
  pruneExpiredJobs(now)

  const isoNow = new Date(now).toISOString()
  const job: StoredWebCheckJob = {
    jobId: randomUUID(),
    userId: input.userId,
    documentId: input.documentId,
    status: 'running',
    scopeLabel: input.scopeLabel,
    startedAt: isoNow,
    updatedAt: isoNow,
    expiresAt: now + JOB_TTL_MS,
  }

  jobs.set(job.jobId, job)
  latestByUserDoc.set(`${input.userId}:${input.documentId}`, job.jobId)
  return toPublicJob(job)
}

/** Mark an active web originality job as completed with its result. */
export function completeWebCheckJob(jobId: string, result: WebOriginalityResult): WebCheckJobPublic | null {
  const existing = jobs.get(jobId)
  if (!existing) return null
  const now = Date.now()
  const updated: StoredWebCheckJob = {
    ...existing,
    status: 'completed',
    result,
    error: undefined,
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + JOB_TTL_MS,
  }
  jobs.set(jobId, updated)
  return toPublicJob(updated)
}

/** Mark an active web originality job as failed with a safe error message. */
export function failWebCheckJob(jobId: string, error: string): WebCheckJobPublic | null {
  const existing = jobs.get(jobId)
  if (!existing) return null
  const now = Date.now()
  const updated: StoredWebCheckJob = {
    ...existing,
    status: 'failed',
    error,
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + JOB_TTL_MS,
  }
  jobs.set(jobId, updated)
  return toPublicJob(updated)
}

/** Return a job if it exists, has not expired, and belongs to `userId`. */
export function getWebCheckJob(jobId: string, userId: string): WebCheckJobPublic | null {
  pruneExpiredJobs()
  const job = jobs.get(jobId)
  if (!job || job.userId !== userId) return null
  return toPublicJob(job)
}

/** Return the most recent tracked web originality job for a user's document, if any. */
export function getLatestWebCheckJobForDocument(userId: string, documentId: string): WebCheckJobPublic | null {
  pruneExpiredJobs()
  const jobId = latestByUserDoc.get(`${userId}:${documentId}`)
  if (!jobId) return null
  return getWebCheckJob(jobId, userId)
}

/** Clear all tracked jobs (used by unit tests). */
export function clearWebCheckJobs(): void {
  jobs.clear()
  latestByUserDoc.clear()
}
