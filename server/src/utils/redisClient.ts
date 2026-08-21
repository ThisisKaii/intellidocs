import { Redis } from '@upstash/redis'
import { createClient, type RedisClientType } from 'redis'

/**
 * Minimal Redis surface used across the app's models. Mirrors the node-redis
 * method names so switching the backing store (Upstash REST vs local Redis)
 * happens in this one file.
 */
export interface RedisCompat {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>
  del(key: string): Promise<unknown>
  ttl(key: string): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  rPush(key: string, value: string): Promise<unknown>
  lRange(key: string, start: number, stop: number): Promise<string[]>
}

let cachedClient: RedisCompat | null = null

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
function buildUpstashClient(): RedisCompat {
  const redis = new Redis({
    url: normalizeUpstashUrl(process.env.UPSTASH_REDIS_REST_URL ?? ''),
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  })

  return {
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

/** Return a singleton Redis client, preferring Upstash REST then local Redis. */
export async function getRedisClient(): Promise<RedisCompat> {
  if (cachedClient) {
    return cachedClient
  }

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    cachedClient = buildUpstashClient()
    return cachedClient
  }

  cachedClient = await buildNodeRedisClient(process.env.REDIS_URL || 'redis://localhost:6379')
  return cachedClient
}
