jest.mock('../../utils/redisClient', () => ({ getRedisClient: jest.fn() }))
jest.mock('../documentModel', () => ({ getDocumentForUser: jest.fn() }))

import { appendBehaviorEvent, appendDocumentBehaviorEvent, getLearnedFormatPatterns } from '../behaviorModel'
import { matchLearnedFormat } from '../../skills/matchLearnedFormat'
import { getRedisClient } from '../../utils/redisClient'
import { getDocumentForUser } from '../documentModel'
import type { Document } from '../../types/index'

/** In-memory stand-in for the Redis commands the behavior model uses. */
function fakeRedis() {
  const strings = new Map<string, string>()
  const lists = new Map<string, string[]>()
  return {
    strings,
    lists,
    get: jest.fn(async (key: string) => strings.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      strings.set(key, value)
      return 'OK'
    }),
    rPush: jest.fn(async (key: string, value: string) => {
      const list = lists.get(key) ?? []
      list.push(value)
      lists.set(key, list)
      return list.length
    }),
  }
}

const HEADING = 'Methodology and Experimental Setup'
const event = (documentId: string) => ({
  action: 'heading1',
  timestamp: '2026-01-01T00:00:00.000Z',
  documentId,
  payload: { text: HEADING, format: 'heading1', fontSize: 10 },
})

function doc(partial: Partial<Document>): Document {
  return { id: 'd', user_id: 'u1', is_isolated: false, formatting_preset: null, genre: 'general', ...partial } as Document
}

describe('genre-partitioned behavior learning', () => {
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(() => {
    redis = fakeRedis()
    ;(getRedisClient as jest.Mock).mockResolvedValue(redis)
    ;(getDocumentForUser as jest.Mock).mockReset()
  })

  it('stamps the genre on the stored event and learns into that genre only', async () => {
    await appendBehaviorEvent('u1', event('paper'), 'ieee')

    const stored = JSON.parse(redis.lists.get('behavior:u1:paper')![0])
    expect(stored).toMatchObject({ documentId: 'paper', genre: 'ieee', userId: 'u1' })
    expect([...redis.strings.keys()]).toEqual(['behavior:formats:u1:ieee'])
  })

  it('never lets a client-sent genre override the server genre', async () => {
    await appendBehaviorEvent('u1', { ...event('paper'), genre: 'thesis' }, 'ieee')
    expect(JSON.parse(redis.lists.get('behavior:u1:paper')![0]).genre).toBe('ieee')
  })

  it('an IEEE habit is invisible to thesis documents', async () => {
    await appendBehaviorEvent('u1', event('paper'), 'ieee')

    expect(await matchLearnedFormat('u1', 'ieee', HEADING)).toMatchObject({ format: 'heading1', fontSize: 10 })
    expect(await matchLearnedFormat('u1', 'thesis', HEADING)).toBeNull()
    expect(await getLearnedFormatPatterns('u1', 'thesis')).toEqual({})
  })

  it('never reads the legacy un-genred pattern map', async () => {
    redis.strings.set('behavior:formats:u1', JSON.stringify({ [HEADING.toLowerCase()]: { format: 'bold', count: 9 } }))
    expect(await matchLearnedFormat('u1', 'general', HEADING)).toBeNull()
  })

  it('resolves the genre from the document, not the event', async () => {
    ;(getDocumentForUser as jest.Mock).mockResolvedValue(doc({ genre: 'thesis' }))

    const outcome = await appendDocumentBehaviorEvent('u1', { ...event('t1'), genre: 'ieee' })

    expect(outcome).toBe('logged')
    expect(JSON.parse(redis.lists.get('behavior:u1:t1')![0]).genre).toBe('thesis')
  })

  it('falls back to the preset genre for documents cached before migration 038', async () => {
    const { genre: _dropped, ...legacy } = doc({ formatting_preset: 'ieee__v2' })
    ;(getDocumentForUser as jest.Mock).mockResolvedValue(legacy)

    await appendDocumentBehaviorEvent('u1', event('p1'))
    expect(JSON.parse(redis.lists.get('behavior:u1:p1')![0]).genre).toBe('ieee')
  })

  it('skips isolated documents', async () => {
    ;(getDocumentForUser as jest.Mock).mockResolvedValue(doc({ is_isolated: true }))
    expect(await appendDocumentBehaviorEvent('u1', event('iso'))).toBe('isolated')
    expect(redis.rPush).not.toHaveBeenCalled()
  })

  it('fails closed when the document cannot be read', async () => {
    ;(getDocumentForUser as jest.Mock).mockRejectedValue(new Error('Document not found'))
    expect(await appendDocumentBehaviorEvent('u1', event('gone'))).toBe('unavailable')
    expect(redis.rPush).not.toHaveBeenCalled()
    expect(redis.set).not.toHaveBeenCalled()
  })
})
