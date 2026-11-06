import type { DocumentGenre, LearnedFormatPattern } from '../types/index'

/** One learned habit the editor can apply: text it recognizes and the formatting to give it. */
export interface LearnedFormattingRule {
  /** Normalized text key (lowercase, single spaces) the habit was learned on. */
  key: string
  /** Readable sample of the text the habit was learned on. */
  snippet: string
  /** Format keys the editor applies (bold, italic, underline, heading1-3, align_*). */
  formats: string[]
  fontSize: number | null
  /** How many times the user applied this formatting to this text. */
  count: number
  confidence: number
}

/** Most rules sent to the editor; the most-used habits first. */
export const MAX_LEARNED_RULES = 200

const USUAL_FORMATTING_PATTERNS: RegExp[] = [
  /\b(?:apply|use|give\s+(?:it|this|the\s+document))\s+(?:me\s+)?(?:my\s+)?(?:usual|learned|learnt|personal|normal|regular|own|saved)\s+(?:formatting|format|formats|style|styles|habits?)\b/i,
  /\bformat\s+(?:the|this|my)\s+(?:whole\s+|entire\s+)?(?:document|doc|paper|file)\s+(?:automatically|for\s+me|my\s+way|like\s+i\s+usually\s+do|the\s+way\s+i\s+usually\s+do)\b/i,
  /\bauto(?:matically)?[\s-]?format\s+(?:the|this|my)\s+(?:whole\s+|entire\s+)?(?:document|doc|paper|file)\b/i,
  /\bformat\s+(?:it|this)\s+(?:like|the\s+way)\s+i\s+(?:usually|always|normally)\s+do\b/i,
]

/** Whether a chat message asks to apply the user's learned formatting to the document. */
export function isUsualFormattingRequest(message: string): boolean {
  return USUAL_FORMATTING_PATTERNS.some((pattern) => pattern.test(message))
}

const BLOCK_FORMATS = new Set(['heading1', 'heading2', 'heading3', 'bold', 'italic', 'underline'])
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])

/** Same confidence curve as matchLearnedFormat: more repetitions, more confidence. */
function confidenceFor(count: number): number {
  return Math.min(0.97, 0.72 + 0.05 * Math.min(count, 5))
}

/** The editor format keys one learned pattern stands for. */
export function formatsForPattern(pattern: LearnedFormatPattern): string[] {
  const formats: string[] = []
  const primary = pattern.format === 'h1' ? 'heading1' : pattern.format === 'h2' ? 'heading2' : pattern.format === 'h3' ? 'heading3' : pattern.format
  if (primary.startsWith('heading') && BLOCK_FORMATS.has(primary)) formats.push(primary)
  if (pattern.bold) formats.push('bold')
  if (pattern.italic) formats.push('italic')
  if (pattern.underline) formats.push('underline')
  if (pattern.textAlign && ALIGNMENTS.has(pattern.textAlign)) formats.push(`align_${pattern.textAlign}`)
  return formats
}

/**
 * Turn one genre's learned text→format map into rules the editor can match against its blocks.
 * Patterns that carry no formatting the editor can apply are left out.
 */
export function buildLearnedFormattingPlan(
  patterns: Record<string, LearnedFormatPattern>,
): LearnedFormattingRule[] {
  return Object.entries(patterns)
    .map(([key, pattern]): LearnedFormattingRule => ({
      key,
      snippet: pattern.snippet,
      formats: formatsForPattern(pattern),
      fontSize: typeof pattern.fontSize === 'number' ? pattern.fontSize : null,
      count: pattern.count,
      confidence: confidenceFor(pattern.count),
    }))
    .filter((rule) => rule.key.length >= 3 && (rule.formats.length > 0 || rule.fontSize !== null))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_LEARNED_RULES)
}

const GENRE_LABELS: Record<DocumentGenre, string> = {
  ieee: 'IEEE',
  thesis: 'thesis',
  memo: 'memo',
  general: 'general',
}

/** How a genre is named to the user ("IEEE", "thesis"). */
export function genreLabel(genre: DocumentGenre): string {
  return GENRE_LABELS[genre]
}

/** The chat reply that goes with a learned-formatting preview. */
export function learnedFormattingReply(genre: DocumentGenre, rules: LearnedFormattingRule[]): string {
  const label = GENRE_LABELS[genre]
  if (rules.length === 0) {
    return `I haven't learned any ${label} formatting habits from you yet. Format a few headings or paragraphs in your ${label} documents and I'll be able to repeat them here.`
  }
  return `I checked this document against your ${rules.length} learned ${label} formatting habit${rules.length === 1 ? '' : 's'} (only ${label} documents teach these). Review the places below, then apply them in one click.`
}
