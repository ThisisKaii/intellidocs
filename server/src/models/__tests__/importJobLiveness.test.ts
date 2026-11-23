/** A running import keeps its job fresh; a job silent for a few minutes has lost its worker. */
const getRedisClient = jest.fn(async () => { throw new Error('no redis in this test') })
jest.mock('../../utils/redisClient', () => ({ getRedisClient: () => getRedisClient() }))

import * as model from '../importJobModel'

const job = (updatedAgoSeconds: number, state: model.ImportJob['state'] = 'converting'): model.ImportJob => ({
  id: 'job-1', userId: 'u1', source: 'local', fileId: '', fileName: 'Thesis.docx', progress: 20, state,
  title: '', html: '', error: '', documentId: '', createdAt: Date.now() - 600_000, updatedAt: Date.now() - updatedAgoSeconds * 1000,
} as model.ImportJob)

it('treats a job silent for over three minutes as failed, not one that is still reporting', () => {
  expect(model.isStaleJob(job(60))).toBe(false)
  expect(model.isStaleJob(job(model.JOB_STALE_SECONDS + 5))).toBe(true)
  expect(model.settleStaleJob(job(model.JOB_STALE_SECONDS + 5))).toMatchObject({ state: 'failed' })
  expect(model.isStaleJob(job(10_000, 'done'))).toBe(false)
})

it('beats well inside the staleness window', () => {
  expect(model.JOB_HEARTBEAT_SECONDS * 3).toBeLessThanOrEqual(model.JOB_STALE_SECONDS)
})

it('keeps a job fresh until stopped, and a failed update never throws', () => {
  jest.useFakeTimers()
  getRedisClient.mockClear()
  const stop = model.keepJobAlive('job-1', 1)
  jest.advanceTimersByTime(3_100)
  stop()
  jest.advanceTimersByTime(5_000)
  // Each beat is one job update, and each update starts by reaching for Redis.
  expect(getRedisClient).toHaveBeenCalledTimes(3)
  jest.useRealTimers()
})
