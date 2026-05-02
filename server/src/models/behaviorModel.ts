import { getRedisClient } from '../utils/redisClient'
import { BehaviorEvent } from '../types/index'

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
}

/** Read behavior events for a user's document from Redis. */
export async function getBehaviorEvents(
  userId: string,
  documentId: string
): Promise<StoredBehaviorEvent[]> {
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
}
