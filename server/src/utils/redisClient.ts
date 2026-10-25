import { Redis } from '@upstash/redis'
import { createClient, type RedisClientType } from 'redis'

/**
 * Minimal Redis surface used across the app's models. Mirrors the node-redis
 * method names so switching the backing store (Upstash REST vs local Redis)
 * happens in this one file.
 */
export interface RedisCompat {
  /** Round-trip a PING. Used by the readiness probe; cheap and side-effect free. */
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>
  del(key: string): Promise<unknown>
  ttl(key: string): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  rPush(key: string, value: string): Promise<unknown>
  lRange(key: string, start: number, stop: number): Promise<string[]>
}

/** One place the app can keep its Redis data, tried in order. */
export interface RedisBackend {
  name: string
  /** Connect (once) and return the client; a rejection means this backend is unreachable. */
  getClient: () => Promise<RedisCompat>
}

/** How long a failing backend is skipped before it is tried again. */
const COOLDOWN_MS = 30_000
/** A call that takes longer than this counts as a failure, so a hung host can't stall requests. */
const CALL_TIMEOUT_MS = 3_000

let cachedClient: RedisCompat | null = null
let cachedStatus: () => RedisStatus = () => ({ active: 'none', backends: [] })

/** Which backend served the last call, and which are currently being skipped. */
export interface RedisStatus {
  active: string
  backends: Array<{ name: string; down: boolean }>
}

/** Normalize a stored Upstash URL (may be rediss://...) to the REST https:// endpoint. */
function normalizeUpstashUrl(rawUrl: string): string {
  const host = rawUrl.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/:\d+$/, '')
  return `https://${host}`
}

/** Convert a raw Upstash value into the string semantics node-redis would return. */
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Convert Upstash list rows (auto-deserialized JSON) back into strings. */
function toStringArray(rows: unknown[]): string[] {
  return rows.map((row: unknown): string =>
    typeof row === 'string' ? row : JSON.stringify(row)
  )
}

/** Build an Upstash REST-backed client that mimics the node-redis API. */
function buildUpstashClient(url: string, token: string): RedisCompat {
  const redis = new Redis({ url: normalizeUpstashUrl(url), token })

  return {
    ping: async () => (await redis.ping()) ?? 'PONG',
    get: async (key) => toStringOrNull(await redis.get(key)),
    set: async (key, value, options) =>
      redis.set(key, value, options?.EX ? { ex: options.EX } : undefined),
    del: async (key) => redis.del(key),
    ttl: async (key) => Number(await redis.ttl(key)),
    incr: async (key) => Number(await redis.incr(key)),
    expire: async (key, seconds) => redis.expire(key, seconds),
    rPush: async (key, value) => redis.rpush(key, value),
    lRange: async (key, start, stop) => toStringArray(await redis.lrange(key, start, stop)),
  }
}

/** Build a local node-redis backed client for a standard redis:// or rediss:// URL. */
async function buildNodeRedisClient(url: string): Promise<RedisCompat> {
  const client: RedisClientType = createClient({
    url,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries: number) => {
        if (retries > 2) {
          return new Error('Redis unavailable after repeated connection attempts')
        }
        return Math.min(500 * 2 ** retries, 2000)
      },
    },
  })

  client.on('error', (err) => {
    console.error('Redis client error:', err)
  })

  if (!client.isOpen) {
    await client.connect()
  }

  return {
    ping: async () => client.ping(),
    get: async (key) => client.get(key),
    set: async (key, value, options) =>
      client.set(key, value, options?.EX ? { EX: options.EX } : undefined),
    del: async (key) => client.del(key),
    ttl: async (key) => client.ttl(key),
    incr: async (key) => client.incr(key),
    expire: async (key, seconds) => client.expire(key, seconds),
    rPush: async (key, value) => client.rPush(key, value),
    lRange: async (key, start, stop) => client.lRange(key, start, stop),
  }
}

/** A stored value in the in-memory backend: a string or a list, with an optional expiry time. */
interface MemoryEntry {
  value: string | string[]
  expiresAt: number | null
}

/**
 * In-process Redis stand-in, the last backend in the chain. It keeps the app
 * working (quotas, import jobs, caches) when every real Redis is unreachable.
 * Its data lives only in this server process and is lost on restart.
 */
export function buildMemoryClient(now: () => number = Date.now): RedisCompat {
  const store = new Map<string, MemoryEntry>()

  /** Look an entry up, dropping it when its expiry has passed. */
  function read(key: string): MemoryEntry | undefined {
    const entry = store.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
      store.delete(key)
      return undefined
    }
    return entry
  }

  /** The list stored at a key, creating it when missing. */
  function listFor(key: string): string[] {
    const entry = read(key)
    if (entry && Array.isArray(entry.value)) return entry.value
    const list: string[] = []
    store.set(key, { value: list, expiresAt: entry?.expiresAt ?? null })
    return list
  }

  return {
    ping: async () => 'PONG',
    get: async (key) => {
      const entry = read(key)
      return entry && typeof entry.value === 'string' ? entry.value : null
    },
    set: async (key, value, options) => {
      store.set(key, { value, expiresAt: options?.EX ? now() + options.EX * 1000 : null })
      return 'OK'
    },
    del: async (key) => (store.delete(key) ? 1 : 0),
    ttl: async (key) => {
      const entry = read(key)
      if (!entry) return -2
      return entry.expiresAt === null ? -1 : Math.max(0, Math.ceil((entry.expiresAt - now()) / 1000))
    },
    incr: async (key) => {
      const entry = read(key)
      const next = (entry && typeof entry.value === 'string' ? Number(entry.value) || 0 : 0) + 1
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null })
      return next
    },
    expire: async (key, seconds) => {
      const entry = read(key)
      if (!entry) return 0
      entry.expiresAt = now() + seconds * 1000
      return 1
    },
    rPush: async (key, value) => listFor(key).push(value),
    lRange: async (key, start, stop) => {
      const entry = read(key)
      if (!entry || !Array.isArray(entry.value)) return []
      const length = entry.value.length
      const from = start < 0 ? Math.max(length + start, 0) : start
      const to = stop < 0 ? length + stop : Math.min(stop, length - 1)
      return entry.value.slice(from, to + 1)
    },
  }
}

/**
 * True for errors that mean "this Redis is unavailable" (network, timeout,
 * server error, quota or rate limit), as opposed to a bad command, which no
 * other backend would answer differently.
 */
export function isBackendFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|fetch failed|timed out|timeout|socket|network|unavailable|429|\b5\d\d\b|max (daily )?request|quota|rate limit|limit exceeded|not reachable|ERR_/i.test(text)
}

/** Reject if a call takes longer than the timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis call timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) },
    )
  })
}

/**
 * A RedisCompat that runs each call on the first healthy backend. A backend
 * that fails is skipped for `cooldownMs`, then tried again, so the primary
 * takes over again by itself once it recovers.
 */
export function createFailoverClient(
  backends: RedisBackend[],
  options: { cooldownMs?: number; callTimeoutMs?: number; now?: () => number } = {},
): { client: RedisCompat; status: () => RedisStatus } {
  const cooldownMs = options.cooldownMs ?? COOLDOWN_MS
  const callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS
  const now = options.now ?? Date.now
  const downUntil = new Map<string, number>()
  let active = backends[0]?.name ?? 'none'

  /** Run one operation, moving down the chain on backend failures. */
  async function run<T>(operation: (client: RedisCompat) => Promise<T>): Promise<T> {
    let lastError: unknown = new Error('No Redis backend configured')
    for (const backend of backends) {
      if ((downUntil.get(backend.name) ?? 0) > now()) continue
      try {
        const result = await withTimeout(backend.getClient().then(operation), callTimeoutMs)
        if (active !== backend.name) console.warn(`[redis] now using ${backend.name}`)
        active = backend.name
        downUntil.delete(backend.name)
        return result
      } catch (error) {
        if (!isBackendFailure(error)) throw error
        lastError = error
        downUntil.set(backend.name, now() + cooldownMs)
        console.warn(`[redis] ${backend.name} failed, skipping it for ${Math.round(cooldownMs / 1000)}s:`, error instanceof Error ? error.message : error)
      }
    }
    throw lastError
  }

  const client: RedisCompat = {
    ping: () => run((c) => c.ping()),
    get: (key) => run((c) => c.get(key)),
    set: (key, value, opts) => run((c) => c.set(key, value, opts)),
    del: (key) => run((c) => c.del(key)),
    ttl: (key) => run((c) => c.ttl(key)),
    incr: (key) => run((c) => c.incr(key)),
    expire: (key, seconds) => run((c) => c.expire(key, seconds)),
    rPush: (key, value) => run((c) => c.rPush(key, value)),
    lRange: (key, start, stop) => run((c) => c.lRange(key, start, stop)),
  }

  return {
    client,
    status: () => ({
      active,
      backends: backends.map((b) => ({ name: b.name, down: (downUntil.get(b.name) ?? 0) > now() })),
    }),
  }
}

/** Wrap a connect function so the connection is made once and shared. */
function lazy(connect: () => Promise<RedisCompat> | RedisCompat): () => Promise<RedisCompat> {
  let pending: Promise<RedisCompat> | null = null
  return () => {
    if (!pending) {
      pending = Promise.resolve(connect()).catch((error: unknown) => {
        pending = null // try connecting again next time
        throw error
      })
    }
    return pending
  }
}

/** The backends this environment configures, in the order they are tried. */
export function configuredBackends(env: NodeJS.ProcessEnv = process.env): RedisBackend[] {
  const backends: RedisBackend[] = []
  const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

  if (hasUpstash) {
    backends.push({ name: 'upstash-primary', getClient: lazy(() => buildUpstashClient(env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!)) })
  }
  if (env.UPSTASH_REDIS_REST_URL_2 && env.UPSTASH_REDIS_REST_TOKEN_2) {
    backends.push({ name: 'upstash-secondary', getClient: lazy(() => buildUpstashClient(env.UPSTASH_REDIS_REST_URL_2!, env.UPSTASH_REDIS_REST_TOKEN_2!)) })
  }
  // A local Redis is used when asked for, or as the default when no Upstash is set up.
  if (env.REDIS_URL || !hasUpstash) {
    backends.push({ name: 'redis', getClient: lazy(() => buildNodeRedisClient(env.REDIS_URL || 'redis://localhost:6379')) })
  }
  const memory = buildMemoryClient()
  backends.push({ name: 'memory', getClient: async () => memory })
  return backends
}

/** Return the singleton Redis client: Upstash, a second Upstash, local Redis, then memory. */
export async function getRedisClient(): Promise<RedisCompat> {
  if (!cachedClient) {
    const failover = createFailoverClient(configuredBackends())
    cachedClient = failover.client
    cachedStatus = failover.status
  }
  return cachedClient
}

/** Which Redis backend is serving requests, for the readiness probe. */
export function getRedisStatus(): RedisStatus {
  return cachedStatus()
}
