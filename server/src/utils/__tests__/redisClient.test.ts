import {
  buildMemoryClient,
  configuredBackends,
  createFailoverClient,
  isBackendFailure,
  type RedisBackend,
  type RedisCompat,
} from '../redisClient'

jest.mock('@upstash/redis', () => ({ Redis: jest.fn() }))
jest.mock('redis', () => ({ createClient: jest.fn() }))

/** A controllable clock for expiry and cooldown tests. */
function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let time = start
  return { now: () => time, advance: (ms) => { time += ms } }
}

describe('memory backend', () => {
  it('stores strings and expires them', async () => {
    const time = clock()
    const redis = buildMemoryClient(time.now)
    await redis.set('k', 'v', { EX: 10 })
    expect(await redis.get('k')).toBe('v')
    expect(await redis.ttl('k')).toBe(10)
    time.advance(11_000)
    expect(await redis.get('k')).toBeNull()
    expect(await redis.ttl('k')).toBe(-2)
  })

  it('counts with incr and starts the expiry window once', async () => {
    const time = clock()
    const redis = buildMemoryClient(time.now)
    expect(await redis.incr('quota')).toBe(1)
    await redis.expire('quota', 60)
    expect(await redis.incr('quota')).toBe(2)
    expect(await redis.ttl('quota')).toBe(60)
    time.advance(61_000)
    expect(await redis.incr('quota')).toBe(1)
  })

  it('keeps ordered lists and reads ranges including negative ends', async () => {
    const redis = buildMemoryClient()
    for (const value of ['a', 'b', 'c']) await redis.rPush('list', value)
    expect(await redis.lRange('list', 0, -1)).toEqual(['a', 'b', 'c'])
    expect(await redis.lRange('list', 1, 1)).toEqual(['b'])
    expect(await redis.lRange('missing', 0, -1)).toEqual([])
  })

  it('deletes keys', async () => {
    const redis = buildMemoryClient()
    await redis.set('k', 'v')
    await redis.del('k')
    expect(await redis.get('k')).toBeNull()
  })
})

describe('isBackendFailure', () => {
  it('treats network, timeout, server and quota errors as failures', () => {
    for (const message of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1', 'Redis call timed out after 3000ms', 'HTTP 503', 'ERR max daily request limit exceeded', '429 Too Many Requests']) {
      expect(isBackendFailure(new Error(message))).toBe(true)
    }
  })

  it('does not treat a bad command as a failure', () => {
    expect(isBackendFailure(new Error('WRONGTYPE Operation against a key holding the wrong kind of value'))).toBe(false)
  })
})

describe('failover client', () => {
  /** A backend whose client answers `get` with its name, or throws while `broken`. */
  function backend(name: string, state: { broken: boolean; calls: number }): RedisBackend {
    const client = {
      get: async () => {
        state.calls += 1
        if (state.broken) throw new Error('fetch failed')
        return name
      },
    } as unknown as RedisCompat
    return { name, getClient: async () => client }
  }

  it('uses the first backend while it works', async () => {
    const a = { broken: false, calls: 0 }
    const b = { broken: false, calls: 0 }
    const { client, status } = createFailoverClient([backend('a', a), backend('b', b)])
    expect(await client.get('k')).toBe('a')
    expect(b.calls).toBe(0)
    expect(status().active).toBe('a')
  })

  it('moves to the next backend when one fails and skips it during the cooldown', async () => {
    const time = clock()
    const a = { broken: true, calls: 0 }
    const b = { broken: false, calls: 0 }
    const { client, status } = createFailoverClient([backend('a', a), backend('b', b)], { cooldownMs: 30_000, now: time.now })
    expect(await client.get('k')).toBe('b')
    expect(await client.get('k')).toBe('b')
    expect(a.calls).toBe(1) // not retried while cooling down
    expect(status().backends).toEqual([{ name: 'a', down: true }, { name: 'b', down: false }])
  })

  it('goes back to the primary after the cooldown once it recovers', async () => {
    const time = clock()
    const a = { broken: true, calls: 0 }
    const b = { broken: false, calls: 0 }
    const { client } = createFailoverClient([backend('a', a), backend('b', b)], { cooldownMs: 30_000, now: time.now })
    await client.get('k')
    a.broken = false
    time.advance(31_000)
    expect(await client.get('k')).toBe('a')
  })

  it('does not fail over on a bad command', async () => {
    const wrong: RedisBackend = {
      name: 'a',
      getClient: async () => ({ get: async () => { throw new Error('WRONGTYPE bad value') } }) as unknown as RedisCompat,
    }
    const b = { broken: false, calls: 0 }
    const { client } = createFailoverClient([wrong, backend('b', b)])
    await expect(client.get('k')).rejects.toThrow('WRONGTYPE')
    expect(b.calls).toBe(0)
  })

  it('treats a hung backend as failed after the call timeout', async () => {
    const hung: RedisBackend = { name: 'a', getClient: async () => ({ get: () => new Promise<string | null>(() => undefined) }) as unknown as RedisCompat }
    const b = { broken: false, calls: 0 }
    const { client } = createFailoverClient([hung, backend('b', b)], { callTimeoutMs: 20 })
    expect(await client.get('k')).toBe('b')
  })

  it('throws the last error when every backend is down', async () => {
    const a = { broken: true, calls: 0 }
    const { client } = createFailoverClient([backend('a', a)])
    await expect(client.get('k')).rejects.toThrow('fetch failed')
  })
})

describe('configuredBackends', () => {
  it('orders upstash, secondary upstash, local redis, then memory', () => {
    const names = configuredBackends({
      UPSTASH_REDIS_REST_URL: 'https://a.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't',
      UPSTASH_REDIS_REST_URL_2: 'https://b.upstash.io', UPSTASH_REDIS_REST_TOKEN_2: 't2',
      REDIS_URL: 'redis://localhost:6379',
    }).map((b) => b.name)
    expect(names).toEqual(['upstash-primary', 'upstash-secondary', 'redis', 'memory'])
  })

  it('always ends with memory, even with one Upstash', () => {
    const names = configuredBackends({ UPSTASH_REDIS_REST_URL: 'https://a.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' }).map((b) => b.name)
    expect(names).toEqual(['upstash-primary', 'memory'])
  })
})
