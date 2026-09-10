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

/** Detect a request like "font size 20" / "size of 20" and return points. */
function detectFontSize(message: string): number | null {
  const match = message.match(/(?:font\s*)?size\s*(?:of\s*)?([0-9]{1,3})/)
  if (!match) return null
  const size = Number.parseInt(match[1], 10)
  return size >= 6 && size <= 96 ? size : null
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

  const scope: 'selection' | 'all' = BULK_SCOPE_PHRASES.some((phrase) =>
    normalized.includes(phrase)
  )
    ? 'all'
    : 'selection'

  return {
    format: formats[0] ?? null,
    formats,
    confidence: firstConfidence,
    matchedPhrase: firstPhrase,
    scope,
    fontSize: detectFontSize(normalized),
  }
}