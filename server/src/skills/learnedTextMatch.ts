/**
 * How a block's text is compared with the text a formatting habit was learned on.
 *
 * Habits are stored under the exact text the user formatted ("chapter 1. introduction"). The next
 * document rarely has the same words: "Chapter 1 Introduction", "CHAPTER I: INTRODUCTION" or
 * "Chapter 2 Review of Related Literature" are the same kind of line and should get the same
 * formatting. Two lines are the same kind when they read the same once numbers, roman numerals and
 * punctuation are set aside, or when both open with the same label and a number ("chapter #").
 *
 * Kept in step with frontend/src/lib/learnedTextMatch.ts.
 */

/** The key a habit is stored under: lowercase, single spaces, at most 120 characters. */
export function learnedKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
}

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/

/** Words with numbers, roman numerals and punctuation set aside ("chapter # introduction"). */
export function learnedFamily(text: string): string {
  return learnedKey(text)
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) || ROMAN.test(word) ? '#' : word))
    .join(' ')
}

/** The "label #" a line opens with ("chapter #", "table #"), or null. */
function labelPrefix(family: string): string | null {
  const [first, second] = family.split(' ')
  return first && second === '#' && /^\p{L}{3,}$/u.test(first) ? `${first} #` : null
}

/** Lines longer than this are prose, never the kind of line a habit stands for. */
const MAX_LINE_WORDS = 14

export type LearnedTextMatch = 'exact' | 'prefix' | 'family'

/**
 * How `text` matches a habit learned on `key`: the same text, text that starts with a learned
 * heading phrase, the same kind of line (see above), or null.
 */
export function learnedTextMatch(key: string, text: string): LearnedTextMatch | null {
  const normalized = learnedKey(text)
  if (normalized.length < 3 || key.length < 3) return null
  if (normalized === key) return 'exact'
  if (key.length >= 6 && normalized.startsWith(key)) return 'prefix'
  if (normalized.split(' ').length > MAX_LINE_WORDS || key.split(' ').length > MAX_LINE_WORDS) return null
  const family = learnedFamily(normalized)
  const learned = learnedFamily(key)
  if (!family || !learned) return null
  // Same words apart from numbering ("chapter 1. introduction" / "chapter 1 introduction").
  if (family === learned && family !== '#') return 'family'
  // Same label and a number ("chapter 1 introduction" / "chapter 2 review of related literature").
  const prefix = labelPrefix(learned)
  return prefix && labelPrefix(family) === prefix ? 'family' : null
}

/** Confidence for a habit seen `count` times, a little lower when only the kind of line matched. */
export function learnedConfidence(count: number, match: LearnedTextMatch): number {
  const base = Math.min(0.97, 0.72 + 0.05 * Math.min(count, 5))
  return match === 'family' ? Math.min(0.92, base - 0.03) : base
}
