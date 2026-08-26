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
  format: FormattingIntent | null
  confidence: number
  matchedPhrase: string | null
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

/** Parse a formatting intent from a natural-language chatbot message. */
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

  for (const entry of intentMap) {
    const matchedPhrase = findMatch(normalized, entry.patterns)
    if (matchedPhrase) {
      return {
        format: entry.format,
        confidence: entry.confidence,
        matchedPhrase,
      }
    }
  }

  return {
    format: null,
    confidence: 0,
    matchedPhrase: null,
  }
}