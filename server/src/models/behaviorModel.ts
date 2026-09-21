import { getRedisClient } from '../utils/redisClient'
import {
  BehaviorEvent,
  FormatBehaviorPayload,
  LearnedFormatPattern,
} from '../types/index'

export interface StoredBehaviorEvent extends BehaviorEvent {
  userId: string
}

export async function appendBehaviorEvent(
  userId: string,
  event: BehaviorEvent
): Promise<void> {
  const client = await getRedisClient()
  const key = `behavior:${userId}:${event.documentId}`
  const payload: StoredBehaviorEvent = { ...event, userId }
  await client.rPush(key, JSON.stringify(payload))

  // Cross-document learning: when the event captures a text+format pair, fold
  // it into the user's learned-pattern map so other documents can suggest it.
  if (payload.payload?.text) {
    await learnFormatPattern(userId, event.action, payload.payload)
  }
}

const patternsKey = (userId: string): string => `behavior:formats:${userId}`

/** Pure merge of a format-apply event into the user's text→format memory map. */
export function mergeLearnedPattern(
  map: Record<string, LearnedFormatPattern>,
  action: string,
  payload: FormatBehaviorPayload
): Record<string, LearnedFormatPattern> {
  const text = payload.text?.trim()
  if (!text || text.length < 3) return map

  const normalized = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
  const existing = map[normalized]
  const now = new Date().toISOString()

  map[normalized] = {
    // Keep the first explicit format action (bold, heading2, ...) as the
    // primary suggestion; later events enrich the combined attributes.
    format: existing?.format ?? payload.format ?? action,
    snippet: existing?.snippet ?? text.slice(0, 80),
    bold: typeof payload.bold === 'boolean' ? payload.bold : (existing?.bold ?? false),
    italic: typeof payload.italic === 'boolean' ? payload.italic : (existing?.italic ?? false),
    underline: typeof payload.underline === 'boolean' ? payload.underline : (existing?.underline ?? false),
    fontSize:
      typeof payload.fontSize === 'number'
        ? payload.fontSize
        : (existing?.fontSize ?? null),
    textAlign:
      typeof payload.textAlign === 'string' && payload.textAlign.length > 0
        ? payload.textAlign
        : existing?.textAlign,
    count: (existing?.count ?? 0) + 1,
    lastAt: now,
  }

  return map
}

/** Merge a format-apply event into the user's per-user text→format memory. */
export async function learnFormatPattern(
  userId: string,
  action: string,
  payload: FormatBehaviorPayload
): Promise<void> {
  try {
    const client = await getRedisClient()
    const key = patternsKey(userId)
    const raw = await client.get(key)
    const map = raw
      ? (JSON.parse(raw) as Record<string, LearnedFormatPattern>)
      : {}

    mergeLearnedPattern(map, action, payload)

    await client.set(key, JSON.stringify(map), { EX: 60 * 60 * 24 * 60 })
  } catch (error) {
    console.warn('Learned-format merge failed:', error)
  }
}

/** Read the user's learned text→format map. Fail-open on Redis outages. */
export async function getLearnedFormatPatterns(
  userId: string
): Promise<Record<string, LearnedFormatPattern>> {
  try {
    const client = await getRedisClient()
    const raw = await client.get(patternsKey(userId))
    return raw ? (JSON.parse(raw) as Record<string, LearnedFormatPattern>) : {}
  } catch (error) {
    console.warn('Learned-format read failed:', error)
    return {}
  }
}

/** Read behavior events for a user's document from Redis. Fail-open on Redis outages. */
export async function getBehaviorEvents(
  userId: string,
  documentId: string
): Promise<StoredBehaviorEvent[]> {
  try {
    const client = await getRedisClient()
    const key = `behavior:${userId}:${documentId}`
    const rows = await client.lRange(key, 0, -1)

    return rows.flatMap((row: string): StoredBehaviorEvent[] => {
      try {
        const parsed = JSON.parse(row) as StoredBehaviorEvent
        return [parsed]
      } catch {
        return []
      }
    })
  } catch (error) {
    console.warn('Behavior read failed, returning empty summary:', error)
    return []
  }
}
