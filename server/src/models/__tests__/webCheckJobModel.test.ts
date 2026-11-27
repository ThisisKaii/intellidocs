import { beforeEach, describe, expect, it } from '@jest/globals'
import {
  clearWebCheckJobs,
  completeWebCheckJob,
  createWebCheckJob,
  failWebCheckJob,
  formatWebCheckScopeLabel,
  getLatestWebCheckJobForDocument,
  getWebCheckJob,
} from '../webCheckJobModel'

describe('webCheckJobModel', () => {
  beforeEach(() => {
    clearWebCheckJobs()
  })

  it('tracks lifecycle transitions and isolates jobs per owner', () => {
    const job = createWebCheckJob({
      userId: 'user-1',
      documentId: 'doc-1',
      scopeLabel: formatWebCheckScopeLabel({ scope: 'pages', pageStart: 2, pageEnd: 5 }),
    })

    expect(job.status).toBe('running')
    expect(job.scopeLabel).toBe('Pages 2–5')
    expect(getWebCheckJob(job.jobId, 'user-2')).toBeNull()
    expect(getLatestWebCheckJobForDocument('user-1', 'doc-1')?.jobId).toBe(job.jobId)

    const completed = completeWebCheckJob(job.jobId, {
      overlap_percent: 12,
      passages: [],
      providers: [],
      sources: [],
      queries: 3,
      truncated: false,
    })

    expect(completed?.status).toBe('completed')
    expect(completed?.result?.overlap_percent).toBe(12)
    expect(getWebCheckJob(job.jobId, 'user-1')?.status).toBe('completed')
  })

  it('records failure reason when an async job fails', () => {
    const job = createWebCheckJob({
      userId: 'user-1',
      documentId: 'doc-2',
      scopeLabel: formatWebCheckScopeLabel({ scope: 'chapter', chapterTitle: 'Introduction' }),
    })

    const failed = failWebCheckJob(job.jobId, 'Upstream search error')
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toBe('Upstream search error')
    expect(getLatestWebCheckJobForDocument('user-1', 'doc-2')?.scopeLabel).toBe('Chapter "Introduction"')
  })
})
