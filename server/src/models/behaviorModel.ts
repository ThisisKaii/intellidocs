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
