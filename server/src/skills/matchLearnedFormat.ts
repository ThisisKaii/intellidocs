import { getLearnedFormatPatterns } from '../models/behaviorModel'
import { DocumentGenre, LearnedFormatMatch, LearnedFormatPattern } from '../types/index'
import { learnedConfidence, learnedTextMatch } from './learnedTextMatch'

// Look up the user's learned text→format memory for ONE genre and return the best match
// for the current text: the same text first, then the same kind of line ("Chapter 1 Introduction"
// after "Chapter 1. introduction" was formatted). Returns null when nothing was learned yet or
// Redis is down. Another specific genre is never consulted (see the "general" fallback below).
export async function matchLearnedFormat(
  userId: string | undefined,
  genre: DocumentGenre,
  text: string | undefined
): Promise<LearnedFormatMatch | null> {
  if (!userId || !text) return null
  if (text.trim().length < 3) return null

  const best = bestMatch(await getLearnedFormatPatterns(userId, genre), text, 0)
  if (best || genre === 'general') return best
  // "General" is what every document is until its text shows its type: a habit learned while a
  // thesis was still short was stored there, and must still count once the document reads as a
  // thesis. Specific genres (IEEE, thesis, memo) never lend their habits to each other.
  return bestMatch(await getLearnedFormatPatterns(userId, 'general'), text, 0.02)
}

/** The best-matching habit of one genre's map for `text`, its confidence lowered by `penalty`. */
function bestMatch(
  patterns: Record<string, LearnedFormatPattern>,
  text: string,
  penalty: number
): LearnedFormatMatch | null {
  let best: LearnedFormatMatch | null = null

  for (const [patternKey, pattern] of Object.entries(patterns)) {
    const match = learnedTextMatch(patternKey, text)
    if (!match) continue

    const confidence = learnedConfidence(pattern.count, match) - penalty
    if (!best || confidence > best.confidence) {
      best = {
        format: pattern.format,
        snippet: pattern.snippet,
        bold: pattern.bold,
        italic: pattern.italic,
        underline: pattern.underline,
        fontSize: pattern.fontSize,
        // The alignment the user gave the line ("center") is part of the habit.
        textAlign: pattern.textAlign,
        confidence,
        count: pattern.count,
      }
    }
  }

  return best
}
