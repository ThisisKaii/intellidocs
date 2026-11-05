import { getRedisClient } from '../utils/redisClient'
import {
  BehaviorEvent,
  DocumentGenre,
  FormatBehaviorPayload,
  LearnedFormatPattern,
} from '../types/index'
import { getDocumentForUser } from './documentModel'
import { resolveDocumentGenre } from '../utils/documentGenre'

export interface StoredBehaviorEvent extends BehaviorEvent {
  userId: string
  /** Genre partition of the event's document; set by the server, never the client. */
  genre: DocumentGenre
}

/** Outcome of logging an event against a document. */
export type DocumentEventOutcome = 'logged' | 'isolated' | 'unavailable'

/**
 * Append a behavior event to the document's Redis list, tagged with `{documentId, genre}`.
 * Learning is partitioned by genre: a text+format pair only feeds that genre's pattern map.
 * Callers outside this module should use `appendDocumentBehaviorEvent`, which resolves the
 * genre from the document itself.
 */
export async function appendBehaviorEvent(
  userId: string,
  event: BehaviorEvent,
  genre: DocumentGenre
): Promise<void> {
  const client = await getRedisClient()
  const key = `behavior:${userId}:${event.documentId}`
  const payload: StoredBehaviorEvent = { ...event, genre, userId }
  await client.rPush(key, JSON.stringify(payload))

  // Cross-document learning within one genre: other documents of the same genre can suggest it.
  // A format the user accepted from a suggestion is not a new observation; counting
  // it would let each accept inflate the confidence of the suggestion itself.
  if (payload.payload?.text && !payload.payload.fromSuggestion) {
    await learnFormatPattern(userId, genre, event.action, payload.payload)
  }
}

/**
 * Log an event against a document the user can access, stamping the document's genre.
 * Fails closed: when the document cannot be read the event is dropped, because an event with
 * no known genre could otherwise land in the wrong partition. Isolated documents are skipped.
 */
export async function appendDocumentBehaviorEvent(
  userId: string,
  event: BehaviorEvent,
  userEmail?: string
): Promise<DocumentEventOutcome> {
  let genre: DocumentGenre
  try {
    const doc = await getDocumentForUser(event.documentId, userId, userEmail)
    if (doc.is_isolated) return 'isolated'
    genre = resolveDocumentGenre(doc)
  } catch {
    return 'unavailable'
  }
  await appendBehaviorEvent(userId, event, genre)
  return 'logged'
}

/** Redis key of one user's learned text→format map for one genre. */
const patternsKey = (userId: string, genre: DocumentGenre): string => `behavior:formats:${userId}:${genre}`

/**
 * Merge one mark flag (bold/italic/underline). A mark the user applied stays
 * learned when a later event merely shows it absent (a size-only change must
 * not erase bold); only the mark's own toggle action can switch it off.
 */
function mergeMarkFlag(existing: boolean | undefined, incoming: boolean | undefined, isOwnAction: boolean): boolean {
  if (incoming === true) return true
  if (incoming === false && isOwnAction) return false
  return existing ?? incoming ?? false
}

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
    bold: mergeMarkFlag(existing?.bold, payload.bold, action === 'bold'),
    italic: mergeMarkFlag(existing?.italic, payload.italic, action === 'italic'),
    underline: mergeMarkFlag(existing?.underline, payload.underline, action === 'underline'),
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

/** Merge a format-apply event into the user's text→format memory for one genre. */
export async function learnFormatPattern(
  userId: string,
  genre: DocumentGenre,
  action: string,
  payload: FormatBehaviorPayload
): Promise<void> {
  try {
    const client = await getRedisClient()
    const key = patternsKey(userId, genre)
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

/**
 * Read the user's learned text→format map for one genre. Fail-open on Redis outages.
 * The legacy un-genred key `behavior:formats:{userId}` is never read: it mixes genres.
 */
export async function getLearnedFormatPatterns(
  userId: string,
  genre: DocumentGenre
): Promise<Record<string, LearnedFormatPattern>> {
  try {
    const client = await getRedisClient()
    const raw = await client.get(patternsKey(userId, genre))
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
