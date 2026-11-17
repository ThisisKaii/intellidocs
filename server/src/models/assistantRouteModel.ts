import { createHash } from 'crypto'
import { getRedisClient } from '../utils/redisClient'

/** A request the fixed rules did not recognise and the tool the AI chose for it. */
export interface CachedRoute {
  /** The request as typed (normalised), kept to turn common phrasings into fixed rules later. */
  message: string
  tool: string
  args: Record<string, unknown>
  confidence: number
}

const ROUTE_TTL_SECONDS = 7 * 24 * 60 * 60
/** Outcomes are kept in one list per day, each dropped after 30 days. */
const OUTCOME_LOG_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Bump when the router's instructions or tools change: routes cached under the old ones are then
 * routed afresh instead of repeating an old pick for a week.
 */
const ROUTE_CACHE_VERSION = 3

/** Same request, same document sections, same router: same route. */
export function routeId(message: string, sectionTitles: readonly string[]): string {
  const normalised = message.toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(`v${ROUTE_CACHE_VERSION}\n${normalised}\n${sectionTitles.join('|')}`).digest('hex').slice(0, 32)
}

function cacheKey(userId: string, id: string): string {
  return `ai:route:${userId}:${id}`
}

/** The route this user's request got before, if it is still cached. Failures read as a miss. */
export async function getCachedRoute(userId: string, id: string): Promise<CachedRoute | null> {
  try {
    const client = await getRedisClient()
    const raw = await client.get(cacheKey(userId, id))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CachedRoute>
    if (typeof value.tool !== 'string' || typeof value.message !== 'string' || typeof value.args !== 'object' || value.args === null) return null
    return { message: value.message, tool: value.tool, args: value.args as Record<string, unknown>, confidence: Number(value.confidence) || 0 }
  } catch {
    return null
  }
}

/** Remember a route for a week, so the same request is answered without the AI. Best-effort. */
export async function cacheRoute(userId: string, id: string, route: CachedRoute): Promise<void> {
  try {
    const client = await getRedisClient()
    await client.set(cacheKey(userId, id), JSON.stringify(route), { EX: ROUTE_TTL_SECONDS })
  } catch {
    /* A cache that cannot be written only means the AI is asked again next time. */
  }
}

/**
 * Record whether the user applied or rejected an AI-chosen change. A rejected route is dropped
 * from the cache, so the request is routed afresh next time. Best-effort.
 */
export async function recordRouteOutcome(userId: string, id: string, applied: boolean): Promise<void> {
  try {
    const client = await getRedisClient()
    const route = await getCachedRoute(userId, id)
    if (!applied) await client.del(cacheKey(userId, id))
    if (!route) return
    const now = new Date()
    const logKey = `ai:route:outcomes:${now.toISOString().slice(0, 10)}`
    await client.rPush(logKey, JSON.stringify({ message: route.message, tool: route.tool, args: route.args, applied, at: now.toISOString() }))
    await client.expire(logKey, OUTCOME_LOG_TTL_SECONDS)
  } catch {
    /* Learning from outcomes must never break the chat. */
  }
}
