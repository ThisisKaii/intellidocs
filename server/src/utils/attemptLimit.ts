import { getRedisClient } from './redisClient'

/**
 * Count one attempt under `key` and say whether it is still allowed: at most `max` attempts per
 * `windowSeconds`. Used to stop guessing of short codes. If the counter store is unavailable the
 * attempt is allowed (the code space is large and the endpoint is authenticated).
 */
export async function allowAttempt(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const redis = await getRedisClient()
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSeconds)
    return count <= max
  } catch {
    return true
  }
}
