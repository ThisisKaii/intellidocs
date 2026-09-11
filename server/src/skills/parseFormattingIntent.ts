export type FormattingIntent =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'blockquote'
  | 'unordered_list'
  | 'ordered_list'

export interface FormattingIntentResult {
  /** Primary (first) matched format — kept for backward compatibility. */
  format: FormattingIntent | null
  /** Every format requested in the message, in parse order. */
  formats: FormattingIntent[]
  confidence: number
  matchedPhrase: string | null
  /** Document scope the user asked for: the current selection or the whole document. */
  scope: 'selection' | 'all'
  /** Explicit font size in points (e.g. "font size 20"), when requested. */
  fontSize: number | null
  /** True when the user asked to clear formatting / return to normal text. */
  normalize: boolean
  /** Chapter or section reference such as "chapter 1" or "introduction". */
  target: string | null
}

/** Normalize a user message before intent matching. */
function normalizeMessage(message: string): string {
  return message.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Return the first matching phrase for a list of patterns. */
function findMatch(
  message: string,
  patterns: readonly string[]
): string | null {
  return patterns.find((pattern) => message.includes(pattern)) ?? null
}

/** Phrases that mean the user wants the formatting applied document-wide. */
const BULK_SCOPE_PHRASES = [
  'everything',
  'everywhere',
  'whole document',
  'entire document',
  'whole doc',
  'whole thing',
  'the whole',
  'all text',
  'all the text',
  'every line',
  'every paragraph',
]

/** Detect a request like "font size 20" / "size of 20" / "12pt" and return points. */
function detectFontSize(message: string): number | null {
  const ptMatch = message.match(/([0-9]{1,3})\s*(?:pt|points?)\b/)
  const sizeMatch = message.match(/(?:font\s*)?size\s*(?:of\s*)?([0-9]{1,3})/)
  const raw = ptMatch?.[1] ?? sizeMatch?.[1]
  if (!raw) return null
  const size = Number.parseInt(raw, 10)
  return size >= 6 && size <= 96 ? size : null
}

/** Phrases that mean the user wants formatting cleared / returned to normal. */
const NORMALIZE_PHRASES = [
  'back to normal',
  'go back to normal',
  'back to default',
  'return to normal',
  'remove bold',
  'remove italic',
  'remove underline',
  'remove all formatting',
  'remove the formatting',
  'remove formatting',
  'undo formatting',
  'undo the formatting',
  'reset formatting',
  'clear formatting',
  'plain text',
  'normal font',
  'default font',
  'make it normal',
  'unformat',
]

/** Word-number mapping so "chapter one" normalizes to "chapter 1". */
const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
}

/** Detect a chapter/section reference such as "chapter 1" or "introduction". */
function detectTarget(message: string): string | null {
  const chapterMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?chapter\s+([0-9]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/)
  if (chapterMatch) {
    const number = NUMBER_WORDS[chapterMatch[1]] ?? chapterMatch[1]
    return `chapter ${number}`
  }

  const sectionMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?section\s+([0-9]{1,2}|one|two|three|four|five)\b/)
  if (sectionMatch) {
    const number = NUMBER_WORDS[sectionMatch[1]] ?? sectionMatch[1]
    return `section ${number}`
  }

  const namedMatch = message.match(/\b(introduction|literature review|methodology|methods|results|discussion|conclusion|references|appendix|abstract)\b/)
  return namedMatch ? namedMatch[1] : null
}

/** Parse one or more formatting intents from a natural-language chatbot message. */
export function parseFormattingIntent(
  message: string
): FormattingIntentResult {
  const normalized = normalizeMessage(message)

  const intentMap: Array<{
    format: FormattingIntent
    confidence: number
    patterns: readonly string[]
  }> = [
    {
      format: 'heading1',
      confidence: 0.96,
      patterns: ['heading 1', 'h1', 'main heading', 'title heading', 'make heading', 'as heading', 'add heading', 'format as heading', 'make this heading', 'apa format', 'apa style', 'format in apa', 'format document', 'format my document', 'academic format'],
    },
    {
      format: 'heading2',
      confidence: 0.95,
      patterns: ['heading 2', 'h2', 'subheading', 'sub-heading', 'section heading', 'make subheading', 'format as subheading'],
    },
    {
      format: 'heading3',
      confidence: 0.94,
      patterns: ['heading 3', 'h3', 'small heading', 'minor heading', 'sub-subheading'],
    },
    {
      format: 'bold',
      confidence: 0.95,
      patterns: ['bold', 'make this bold', 'make it bold', 'strong emphasis', 'bold text'],
    },
    {
      format: 'italic',
      confidence: 0.95,
      patterns: ['italic', 'italics', 'make this italic', 'make it italic', 'emphasize'],
    },
    {
      format: 'underline',
      confidence: 0.94,
      patterns: ['underline', 'underlined', 'add underline', 'make underline'],
    },
    {
      format: 'blockquote',
      confidence: 0.93,
      patterns: ['blockquote', 'quote block', 'quoted section', 'block quote', 'format quote'],
    },
    {
      format: 'unordered_list',
      confidence: 0.92,
      patterns: ['bullet list', 'bulleted list', 'unordered list', 'bullets', 'bullet points', 'make bullet'],
    },
    {
      format: 'ordered_list',
      confidence: 0.92,
      patterns: ['numbered list', 'ordered list', 'number list', 'numbered items', 'numbers'],
    },
  ]

  const formats: FormattingIntent[] = []
  let firstPhrase: string | null = null
  let firstConfidence = 0

  for (const entry of intentMap) {
    const matchedPhrase = findMatch(normalized, entry.patterns)
    if (matchedPhrase) {
      if (!formats.includes(entry.format)) formats.push(entry.format)
      if (firstPhrase === null) firstPhrase = matchedPhrase
      if (firstConfidence === 0) firstConfidence = entry.confidence
    }
  }

  const target = detectTarget(normalized)
  const scope: 'selection' | 'all' =
    target !== null ||
    BULK_SCOPE_PHRASES.some((phrase) => normalized.includes(phrase))
      ? 'all'
      : 'selection'
  const normalize = NORMALIZE_PHRASES.some((phrase) => normalized.includes(phrase))

  return {
    format: formats[0] ?? null,
    formats,
    confidence: firstConfidence,
    matchedPhrase: firstPhrase,
    scope,
    fontSize: detectFontSize(normalized),
    normalize,
    target,
  }
}