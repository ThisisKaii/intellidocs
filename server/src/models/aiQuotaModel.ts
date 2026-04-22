import { getRedisClient } from '../utils/redisClient'

export interface AIQuotaStatus {
  key: string
  count: number
  limit: number
  remaining: number
  resetInSeconds: number
  allowed: boolean
}

const DEFAULT_QUOTA_LIMIT = 30
const DEFAULT_QUOTA_WINDOW_SECONDS = 60

/** Build the Redis key used to track a user's AI quota window. */
function buildQuotaKey(userId: string, scope: string): string {
  return `ai:quota:${scope}:${userId}`
}

/** Read the configured quota limit from the environment. */
function getQuotaLimit(): number {
  const rawLimit = Number(process.env.AI_REQUEST_QUOTA_LIMIT)
  return Number.isFinite(rawLimit) && rawLimit > 0
    ? rawLimit
    : DEFAULT_QUOTA_LIMIT
}

/** Read the configured quota window in seconds from the environment. */
function getQuotaWindowSeconds(): number {
  const rawWindow = Number(process.env.AI_REQUEST_QUOTA_WINDOW_SECONDS)
  return Number.isFinite(rawWindow) && rawWindow > 0
    ? rawWindow
    : DEFAULT_QUOTA_WINDOW_SECONDS
}

/** Read the current quota state for a user and scope without incrementing it. */
export async function getAIQuotaStatus(
  userId: string,
  scope = 'default'
): Promise<AIQuotaStatus> {
  const client = await getRedisClient()
  const key = buildQuotaKey(userId, scope)
  const limit = getQuotaLimit()
  const rawCount = await client.get(key)
  const ttl = await client.ttl(key)
  const count = rawCount ? Number(rawCount) : 0
  const resetInSeconds = ttl > 0 ? ttl : getQuotaWindowSeconds()

  return {
    key,
    count,
    limit,
    remaining: Math.max(limit - count, 0),
    resetInSeconds,
    allowed: count < limit,
  }
}

/** Increment a user's quota counter and return the updated quota status. */
export async function consumeAIQuota(
  userId: string,
  scope = 'default'
): Promise<AIQuotaStatus> {
  const client = await getRedisClient()
  const key = buildQuotaKey(userId, scope)
  const limit = getQuotaLimit()
  const windowSeconds = getQuotaWindowSeconds()

  const count = await client.incr(key)
  if (count === 1) {
    await client.expire(key, windowSeconds)
  }

  const ttl = await client.ttl(key)
  return {
    key,
    count,
    limit,
    remaining: Math.max(limit - count, 0),
    resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    allowed: count <= limit,
  }
}

/** Clear a user's quota counter for a specific scope. */
export async function resetAIQuota(
  userId: string,
  scope = 'default'
): Promise<void> {
  const client = await getRedisClient()
  const key = buildQuotaKey(userId, scope)
  await client.del(key)
}