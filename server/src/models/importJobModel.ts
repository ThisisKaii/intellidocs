import crypto from 'crypto'
import { getRedisClient } from '../utils/redisClient'

/** Lifecycle of a large-file Drive import. */
export type ImportJobState = 'queued' | 'downloading' | 'converting' | 'done' | 'failed'

/** A tracked large-file import, stored in Redis and polled by the client. */
export interface ImportJob {
  id: string
  userId: string
  fileId: string
  fileName: string
  /** 0-100; meaningful while queued/downloading/converting. */
  progress: number
  state: ImportJobState
  title: string
  html: string
  error: string
  createdAt: number
  updatedAt: number
}

/** Jobs are polled by the client, so they expire once nobody is watching. */
const JOB_TTL_SECONDS = 3600

/** How many recent jobs to keep per user for reconnecting clients. */
const HISTORY_LIMIT = 10

const jobKey = (jobId: string): string => `drive:import:job:${jobId}`
const userIndexKey = (userId: string): string => `drive:import:jobs:${userId}`
const queueKey = (): string => 'drive:import:queue'

/** Remove keys from a list without a blocking pop, for a bounded history. */
async function trimIndex(client: Awaited<ReturnType<typeof getRedisClient>>, userId: string): Promise<void> {
  const key = userIndexKey(userId)
  const ids = await client.lRange(key, 0, -1)
  const excess = ids.length - HISTORY_LIMIT
  if (excess <= 0) return
  for (const id of ids.slice(0, excess)) {
    await client.del(jobKey(id))
  }
  // Rewrite the index so the trimmed ids stop being advertised.
  const kept = ids.slice(excess)
  await client.del(key)
  for (const id of kept) {
    await client.rPush(key, id)
  }
}

/** Create a queued job and return its full record. */
export async function createImportJob(
  userId: string,
  fileId: string,
  fileName: string
): Promise<ImportJob> {
  const client = await getRedisClient()
  const job: ImportJob = {
    id: crypto.randomUUID(),
    userId,
    fileId,
    fileName,
    progress: 0,
    state: 'queued',
    title: '',
    html: '',
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await client.set(jobKey(job.id), JSON.stringify(job), { EX: JOB_TTL_SECONDS })
  await client.rPush(userIndexKey(userId), job.id)
  await client.expire(userIndexKey(userId), JOB_TTL_SECONDS)
  await client.rPush(queueKey(), job.id)
  await client.expire(queueKey(), JOB_TTL_SECONDS)
  await trimIndex(client, userId)

  return job
}

/** Fetch a job, or null when it expired or never existed. */
export async function getImportJob(jobId: string): Promise<ImportJob | null> {
  const client = await getRedisClient()
  const raw = await client.get(jobKey(jobId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImportJob
  } catch {
    return null
  }
}

/**
 * Update a job's progress. Passing `html` records the converted document;
 * omitting it leaves the previously stored value untouched.
 */
export async function updateImportJob(
  jobId: string,
  patch: Partial<Pick<ImportJob, 'state' | 'progress' | 'error' | 'title' | 'html'>>
): Promise<void> {
  const client = await getRedisClient()
  const existing = await getImportJob(jobId)
  if (!existing) return

  const merged: ImportJob = {
    ...existing,
    ...patch,
    // Never let a partial update wipe a stored error message with ''.
    error: patch.error ?? existing.error,
    updatedAt: Date.now(),
  }

  await client.set(jobKey(jobId), JSON.stringify(merged), { EX: JOB_TTL_SECONDS })
}

/** Mark a job failed and drop it from the pending queue. */
export async function failImportJob(jobId: string, error: string): Promise<void> {
  await updateImportJob(jobId, { state: 'failed', error, progress: 0 })
  await removeFromQueue(jobId)
}

/** Remove a job id from the pending queue list. */
export async function removeFromQueue(jobId: string): Promise<void> {
  const client = await getRedisClient()
  const key = queueKey()
  const ids = await client.lRange(key, 0, -1)
  if (!ids.includes(jobId)) return
  await client.del(key)
  for (const id of ids.filter((candidate) => candidate !== jobId)) {
    await client.rPush(key, id)
  }
}

/** Fetch the most recent jobs for a user, newest first. */
export async function listUserImportJobs(userId: string): Promise<ImportJob[]> {
  const client = await getRedisClient()
  const ids = await client.lRange(userIndexKey(userId), 0, -1)
  const jobs = await Promise.all(ids.map((id) => getImportJob(id)))
  return jobs
    .filter((job): job is ImportJob => job !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * A job is stale when it has been sitting unfinished past the TTL, which means
 * the worker died (replica restart, OOM kill) mid-import. The client treats a
 * stale job as failed instead of polling forever.
 */
export function isStaleJob(job: ImportJob, ttlSeconds = JOB_TTL_SECONDS): boolean {
  if (job.state === 'done' || job.state === 'failed') return false
  return Date.now() - job.updatedAt > ttlSeconds * 1000
}
