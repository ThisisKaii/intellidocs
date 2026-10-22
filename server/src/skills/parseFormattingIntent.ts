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
  | 'align_left'
  | 'align_center'
  | 'align_right'
  | 'align_justify'

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
  /**
   * Which blocks a bulk request targets: all headings, all paragraphs, or the
   * whole document. Defaults to 'all' when no specific category is named.
   */
  targetCategory: 'headings' | 'paragraphs' | 'all'
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
  'all headings',
  'every heading',
  'all subheadings',
  'all sections',
  'the rest',
  'remaining',
]

/**
 * Detect whether a bulk request names a specific block category. Plural or
 * quantified forms ("all headings", "every paragraph") count; singular
 * references ("this heading") do not — those keep selection scope.
 */
function detectTargetCategory(message: string): 'headings' | 'paragraphs' | 'all' {
  const headingsPattern =
    /\b(?:sub-?headings|headings|section (?:headings|titles))\b|\b(?:all|every|each)\s+(?:sub-?heading|section heading|title)\b|\b(?:all|every|each)\s+h[123]\b/
  if (headingsPattern.test(message)) return 'headings'

  const paragraphsPattern =
    /\bparagraphs\b|\b(?:all|every|each)\s+paragraph\b|\b(?:all|every|each)\s+(?:body|normal)\s+text\b/
  if (paragraphsPattern.test(message)) return 'paragraphs'

  return 'all'
}

/** Detect a request like "font size 20" / "size of 20" / "12pt" and return points. */
function detectFontSize(message: string): number | null {
  const ptMatch = message.match(/([0-9]{1,3})\s*(?:pt|points?)\b/)
  const sizeMatch = message.match(/(?:font\s*)?size\s*(?:of\s*)?([0-9]{1,3})/)
  const raw = ptMatch?.[1] ?? sizeMatch?.[1]
  if (!raw) return null
  const size = Number.parseInt(raw, 10)
  return size >= 6 && size <= 96 ? size : null
}

/**
 * Alignment requests are matched with regexes rather than plain phrases so
 * words may sit between the verb and the direction ("align this to the left").
 * No matcher accepts a bare "right", so "right now" stays a normal request.
 */
const ALIGNMENT_MATCHERS: ReadonlyArray<{
  format: 'align_left' | 'align_center' | 'align_right' | 'align_justify'
  patterns: readonly RegExp[]
}> = [
  {
    format: 'align_left',
    patterns: [/\balign\w*\b[^.?!]{0,24}\bleft\b/, /\bleft[\s-]?align\w*\b/, /\bflush\s+left\b/],
  },
  {
    format: 'align_center',
    patterns: [
      /\balign\w*\b[^.?!]{0,24}\bcent(?:er|re)\w*\b/,
      /\bcent(?:er|re)[\s-]?align\w*\b/,
      /\bflush\s+cent(?:er|re)\b/,
      /\bcent(?:er|re)(?:ed|ing|s)?\b/,
    ],
  },
  {
    format: 'align_right',
    patterns: [/\balign\w*\b[^.?!]{0,24}\bright\b/, /\bright[\s-]?align\w*\b/, /\bflush\s+right\b/],
  },
  {
    format: 'align_justify',
    patterns: [/\balign\w*\b[^.?!]{0,24}\bjustif\w*\b/, /\bjustif\w+\b/],
  },
]

/** Confidence reported when the message only asks for an alignment change. */
const ALIGNMENT_CONFIDENCE = 0.93

/** Detect a text-alignment request such as "align this to the left". */
function detectAlignment(
  message: string
): { format: 'align_left' | 'align_center' | 'align_right' | 'align_justify'; phrase: string } | null {
  for (const entry of ALIGNMENT_MATCHERS) {
    for (const pattern of entry.patterns) {
      const match = message.match(pattern)
      if (match) return { format: entry.format, phrase: match[0].trim() }
    }
  }
  return null
}

/** Phrases that mean the user wants formatting cleared / returned to normal. */const NORMALIZE_PHRASES = [
  'back to normal',
  'go back to normal',
  'back to default',
  'return to normal',
  'remove bold',
  'remove the bold',
  'remove italic',
  'remove the italic',
  'remove underline',
  'remove the underline',
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

/** Command and generic words that must not become phrase-prefixed targets. */
const TARGET_STOP_WORDS = new Set([
  'bold',
  'bolded',
  'italic',
  'italicized',
  'underline',
  'underlined',
  'normal',
  'plain',
  'center',
  'centre',
  'left',
  'right',
  'justify',
  'justified',
  'here',
  'there',
  'this',
  'that',
  'it',
  'them',
  'me',
  'us',
  'document',
  'doc',
  'paragraph',
  'section',
  'chapter',
  'line',
  'block',
  'page',
  'heading',
  'title',
  'text',
  'word',
  'words',
  'phrase',
  'content',
  'to',
  'as',
  'in',
  'into',
  'with',
  'and',
  'then',
  'for',
  'of',
  'on',
  'at',
  'by',
  'from',
  'my',
  'our',
  'your',
  'his',
  'her',
  'their',
  'first',
  'last',
  'next',
  'previous',
  'above',
  'below',
  'the',
  'a',
  'an',
])

/** Standard academic section names used as fallback targets. */
const KNOWN_SECTION_NAMES = [
  'introduction',
  'literature review',
  'methodology',
  'methods',
  'results',
  'discussion',
  'conclusion',
  'references',
  'appendix',
  'abstract',
  'approval sheet',
  'acknowledgement',
  'acknowledgments',
  'dedication',
] as const

/** Match a known section name anywhere in the message. */
const NAMED_SECTION_PATTERN = new RegExp(`\\b(${KNOWN_SECTION_NAMES.join('|')})\\b`)

/** True when the whole candidate is a known section name. */
function isKnownSection(candidate: string): boolean {
  return KNOWN_SECTION_NAMES.some((name) => name === candidate.toLowerCase())
}

/**
 * Detect an explicit target — a quoted phrase first (e.g. 'approval sheet'),
 * then a phrase-prefixed name, then chapter/section references, then the
 * standard academic section names.
 */
function detectTarget(message: string): string | null {
  // 1. Quoted targets have highest priority. Boundary checks avoid treating
  // an apostrophe in a contraction ("don't") as an opening quote.
  const doubleQuoted = message.match(/"([^"]{2,80})"/)
  if (doubleQuoted) return doubleQuoted[1].trim()

  const singleQuoted = message.match(/(?:^|[\s(\[{,;:])'([^']{2,80})'(?=$|[\s)\]}.,;:!?])/)
  if (singleQuoted) return singleQuoted[1].trim()

  // 2. Phrase-prefixed targets: "text approval sheet", "heading abstract".
  const prefixMatch = message.match(
    /\b(?:text|heading|title|phrase|words?)\s+(?:of\s+|for\s+|titled\s+|named\s+|called\s+)?([a-z][a-z0-9\s-]{1,40})/i
  )
  if (prefixMatch) {
    const candidate = prefixMatch[1]
      .trim()
      .replace(/^(?:the|a|an|my|our|your|his|her|their)\s+/i, '')
      .replace(
        /\s+\b(?:bold|bolded|italic|italicized|underline|underlined|normal|plain|center|centre|left|right|justify|justified|font|size|with|and|then)\b.*$/i,
        ''
      )
      .trim()
    // Only accept a phrase-prefixed candidate when it is a known section or
    // the message uses an explicit target marker ("text of ...", "title
    // titled ..."). This prevents commands like "make the heading look
    // better" from targeting the words "look better".
    const hasExplicitMarker =
      /\b(?:text|heading|title|phrase|words?)\s+(?:of|for|titled|named|called)\b/i.test(message)
    if (
      candidate.length >= 3 &&
      !/^\d+$/.test(candidate) &&
      !TARGET_STOP_WORDS.has(candidate.toLowerCase()) &&
      !/^(?:to|as|in|into|with|and|then|for|of|on|at|by|from|first|last|next|previous|above|below)\b/i.test(candidate) &&
      !/^(?:chapter|section)\s+\d+$/i.test(candidate) &&
      (hasExplicitMarker || isKnownSection(candidate))
    ) {
      return candidate
    }
  }

  // 3. Chapter references.
  const chapterMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?chapter\s+([0-9]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/)
  if (chapterMatch) {
    const number = NUMBER_WORDS[chapterMatch[1]] ?? chapterMatch[1]
    return `chapter ${number}`
  }

  // 4. Section references.
  const sectionMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?section\s+([0-9]{1,2}|one|two|three|four|five)\b/)
  if (sectionMatch) {
    const number = NUMBER_WORDS[sectionMatch[1]] ?? sectionMatch[1]
    return `section ${number}`
  }

  // 5. Standard academic section names.
  const namedMatch = message.match(NAMED_SECTION_PATTERN)
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

  // Alignment is detected separately so a message can ask for both a mark and
  // an alignment ("make this bold and center it").
  const alignment = detectAlignment(normalized)
  if (alignment && !formats.includes(alignment.format)) {
    formats.push(alignment.format)
    if (firstPhrase === null) firstPhrase = alignment.phrase
    if (firstConfidence === 0) firstConfidence = ALIGNMENT_CONFIDENCE
  }

  const target = detectTarget(normalized)
  const targetCategory = detectTargetCategory(normalized)
  // A named category ("all headings") is itself a document-wide request.
  const scope: 'selection' | 'all' =
    target !== null ||
    targetCategory !== 'all' ||
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
    targetCategory,
  }
}