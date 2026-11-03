import { describe, expect, it } from 'vitest'
import { fetchAnnouncedDocument, isDocSyncNotice, isNewer, type DocSyncNotice } from './docSync'

const notice: DocSyncNotice = { updated_at: '2026-11-03T10:00:05.000Z', sender_id: 'u2', timestamp: 1 }

describe('isDocSyncNotice', () => {
  it('accepts a save notice and nothing else', () => {
    expect(isDocSyncNotice(notice)).toBe(true)
    // The whole-document payload older clients broadcast is not a notice.
    expect(isDocSyncNotice({ content: '<p>x</p>', sender_id: 'u2', timestamp: 1 })).toBe(false)
    expect(isDocSyncNotice(null)).toBe(false)
  })

  it('stays small however long the document is', () => {
    expect(JSON.stringify(notice).length).toBeLessThan(120)
  })
})

describe('isNewer', () => {
  it('orders saved states by time', () => {
    expect(isNewer('2026-11-03T10:00:05Z', null)).toBe(true)
    expect(isNewer('2026-11-03T10:00:05Z', '2026-11-03T10:00:04Z')).toBe(true)
    expect(isNewer('2026-11-03T10:00:05Z', '2026-11-03T10:00:05Z')).toBe(false)
    expect(isNewer('2026-11-03T10:00:04Z', '2026-11-03T10:00:05Z')).toBe(false)
  })
})

describe('fetchAnnouncedDocument', () => {
  it('returns the announced state', async () => {
    const doc = await fetchAnnouncedDocument(notice, async () => ({ updated_at: notice.updated_at, content: 'new' }))
    expect(doc?.content).toBe('new')
  })

  it('retries a read that returns the previous state', async () => {
    const reads = [{ updated_at: '2026-11-03T10:00:01Z', content: 'old' }, { updated_at: notice.updated_at, content: 'new' }]
    let calls = 0
    const doc = await fetchAnnouncedDocument(notice, async () => reads[calls++], { delayMs: 1 })
    expect(calls).toBe(2)
    expect(doc?.content).toBe('new')
  })

  it('gives up on a state that never arrives rather than applying an older one', async () => {
    let calls = 0
    const doc = await fetchAnnouncedDocument(
      notice,
      async () => {
        calls += 1
        return { updated_at: '2026-11-03T10:00:01Z', content: 'old' }
      },
      { attempts: 3, delayMs: 1 },
    )
    expect(calls).toBe(3)
    expect(doc).toBeNull()
  })
})
