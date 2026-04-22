import { getRedisClient } from '../utils/redisClient'

export interface CachedSuggestion {
  predictedFormat: string
  confidence: number
  featureValues: Record<string, number>
}

const SUGGESTION_TTL_SECONDS = 30

/** Build a stable Redis cache key for a user's suggestion request. */
function buildSuggestionCacheKey(userId: string, text: string): string {
  return `ai:suggestions:${userId}:${text.trim().toLowerCase()}`
}

/** Read a cached formatting suggestion from Redis if it exists. */
export async function getCachedSuggestion(
  userId: string,
  text: string
): Promise<CachedSuggestion | null> {
  const normalizedText = text.trim()

  if (!normalizedText) {
    return null
  }

  const client = await getRedisClient()
  const key = buildSuggestionCacheKey(userId, normalizedText)
  const cachedValue = await client.get(key)

  if (!cachedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(cachedValue) as CachedSuggestion

    if (
      typeof parsed.predictedFormat !== 'string' ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.featureValues !== 'object' ||
      parsed.featureValues === null
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/** Store a formatting suggestion in Redis with a short-lived TTL. */
export async function cacheSuggestion(
  userId: string,
  text: string,
  suggestion: CachedSuggestion
): Promise<void> {
  const normalizedText = text.trim()

  if (!normalizedText) {
    return
  }

  const client = await getRedisClient()
  const key = buildSuggestionCacheKey(userId, normalizedText)

  await client.set(
    key,
    JSON.stringify({
      predictedFormat: suggestion.predictedFormat,
      confidence: suggestion.confidence,
      featureValues: suggestion.featureValues,
    }),
    {
      EX: SUGGESTION_TTL_SECONDS,
    }
  )
}

/** Remove a cached formatting suggestion for a specific user and text. */
export async function clearCachedSuggestion(
  userId: string,
  text: string
): Promise<void> {
  const normalizedText = text.trim()

  if (!normalizedText) {
    return
  }

  const client = await getRedisClient()
  const key = buildSuggestionCacheKey(userId, normalizedText)
  await client.del(key)
}