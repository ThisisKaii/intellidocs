import { config } from 'dotenv'
import {
  createImportJob,
  failImportJob,
  getImportJob,
  isStaleJob,
  listUserImportJobs,
  removeFromQueue,
  updateImportJob,
  type ImportJob,
} from '../../models/importJobModel'
import { getRedisClient } from '../../utils/redisClient'

// Jest does not load .env, so the client would fall back to a local
// redis://localhost:6379 that is not running in this environment. Load the real
// config so these integration assertions exercise the same store the app uses.
config({ path: '.env' })

/** Build a fully-populated job for the pure-logic assertions. */
function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: 'job-1',
    userId: 'user-1',
    fileId: 'file-1',
    fileName: 'thesis.docx',
    progress: 0,
    state: 'queued',
    title: '',
    html: '',
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('isStaleJob', () => {
  it('is not stale while work is in flight', () => {
    expect(isStaleJob(makeJob({ state: 'downloading' }))).toBe(false)
  })

  it('is not stale once the job reached a terminal state', () => {
    const old = { updatedAt: Date.now() - 10_000_000 }
    expect(isStaleJob(makeJob({ state: 'done', ...old }))).toBe(false)
    expect(isStaleJob(makeJob({ state: 'failed', ...old }))).toBe(false)
  })

  it('is stale when an unfinished job outlives the TTL', () => {
    // Simulates a worker that died mid-import: state never advanced and the
    // last update is older than the TTL.
    const job = makeJob({
      state: 'converting',
      updatedAt: Date.now() - 3601 * 1000,
    })
    expect(isStaleJob(job)).toBe(true)
  })

  it('honours a custom TTL', () => {
    const job = makeJob({ state: 'downloading', updatedAt: Date.now() - 5000 })
    expect(isStaleJob(job, 1)).toBe(true)
    expect(isStaleJob(job, 60)).toBe(false)
  })
})

describe('import job store (requires Redis)', () => {
  // This suite talks to a real Upstash instance, so every assertion costs
  // several network round-trips. Jest's 5s default is too tight for it and
  // fails intermittently on a slow connection or a busy machine.
  jest.setTimeout(30_000)

  const userId = 'test-user-imports'
  const createdIds: string[] = []

  afterAll(async () => {
    const client = await getRedisClient()
    for (const id of createdIds) {
      await client.del(`drive:import:job:${id}`)
    }
    await client.del(`drive:import:jobs:${userId}`)
  })

  it('creates a queued job and reads it back', async () => {
    const job = await createImportJob(userId, 'file-abc', 'Thesis.docx')
    createdIds.push(job.id)

    expect(job.state).toBe('queued')
    expect(job.progress).toBe(0)
    expect(job.userId).toBe(userId)

    const fetched = await getImportJob(job.id)
    expect(fetched?.fileName).toBe('Thesis.docx')
    expect(fetched?.state).toBe('queued')
  })

  it('updates progress without losing other fields', async () => {
    const job = await createImportJob(userId, 'file-abc', 'Thesis.docx')
    createdIds.push(job.id)

    await updateImportJob(job.id, { state: 'downloading', progress: 42 })

    const fetched = await getImportJob(job.id)
    expect(fetched?.progress).toBe(42)
    expect(fetched?.state).toBe('downloading')
    // The identifying fields must survive a partial patch.
    expect(fetched?.fileId).toBe('file-abc')
  })

  it('stores converted HTML on completion', async () => {
    const job = await createImportJob(userId, 'file-abc', 'Thesis.docx')
    createdIds.push(job.id)

    await updateImportJob(job.id, { state: 'done', progress: 100, title: 'Thesis', html: '<p>Body</p>' })

    const fetched = await getImportJob(job.id)
    expect(fetched?.state).toBe('done')
    expect(fetched?.html).toBe('<p>Body</p>')
    expect(fetched?.title).toBe('Thesis')
  })

  it('does not erase a recorded error on an unrelated update', async () => {
    const job = await createImportJob(userId, 'file-abc', 'Thesis.docx')
    createdIds.push(job.id)

    await failImportJob(job.id, 'conversion service unavailable')
    await updateImportJob(job.id, { state: 'downloading' })

    // A progress update must never wipe the diagnostic the client shows.
    const fetched = await getImportJob(job.id)
    expect(fetched?.error).toBe('conversion service unavailable')
  })

  it('returns null for an unknown job', async () => {
    expect(await getImportJob('does-not-exist')).toBeNull()
  })

  it('lists a user’s jobs newest first', async () => {
    const listUser = 'test-user-import-order'
    const first = await createImportJob(listUser, 'f1', 'First.docx')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await createImportJob(listUser, 'f2', 'Second.docx')
    createdIds.push(first.id, second.id)

    const jobs = await listUserImportJobs(listUser)
    expect(jobs[0].id).toBe(second.id)

    const client = await getRedisClient()
    await client.del(`drive:import:jobs:${listUser}`)
  })

  it('does not leak another user’s jobs into the list', async () => {
    const other = await createImportJob('test-user-other', 'f9', 'NotMine.docx')
    createdIds.push(other.id)

    const jobs = await listUserImportJobs(userId)
    expect(jobs.every((job) => job.userId === userId)).toBe(true)
  })

  it('removes a completed job from the pending queue', async () => {
    const job = await createImportJob(userId, 'file-abc', 'Queued.docx')
    createdIds.push(job.id)

    const client = await getRedisClient()
    expect(await client.lRange('drive:import:queue', 0, -1)).toContain(job.id)

    await removeFromQueue(job.id)
    expect(await client.lRange('drive:import:queue', 0, -1)).not.toContain(job.id)
  })
})
