import { getLearnedFormatPatterns } from '../models/behaviorModel'
import { LearnedFormatMatch } from '../types/index'

// Look up the user's learned text→format memory and return the best match for
// the current text. Returns null when nothing was learned yet or Redis is down.
export async function matchLearnedFormat(
  userId: string | undefined,
  text: string | undefined
): Promise<LearnedFormatMatch | null> {
  if (!userId || !text) return null

  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized.length < 3) return null

  const patterns = await getLearnedFormatPatterns(userId)
  let best: LearnedFormatMatch | null = null

  for (const [patternKey, pattern] of Object.entries(patterns)) {
    // Exact match, or the current text starts with a learned heading phrase.
    const matches =
      normalized === patternKey ||
      (patternKey.length >= 6 && normalized.startsWith(patternKey))
    if (!matches) continue

    const confidence = Math.min(0.97, 0.72 + 0.05 * Math.min(pattern.count, 5))
    if (!best || confidence > best.confidence) {
      best = {
        format: pattern.format,
        snippet: pattern.snippet,
        bold: pattern.bold,
        italic: pattern.italic,
        underline: pattern.underline,
        fontSize: pattern.fontSize,
        textAlign: pattern.textAlign,
        confidence,
        count: pattern.count,
      }
    }
  }

  return best
}