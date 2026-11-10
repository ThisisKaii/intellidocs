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
   * How the target is meant: 'literal' (a quoted phrase: just those words),
   * 'heading' (a named section or chapter: just its title line), 'section'
   * (the title line and everything under it), or 'title' (the document title).
   */
  targetMode: TargetMode | null
  /**
   * Which blocks a bulk request targets: all headings, all paragraphs, every
   * chapter heading, every section heading (headings other than chapter
   * headings), or the whole document. Defaults to 'all' when no specific
   * category is named.
   */
  targetCategory: TargetCategory
  /** Block and text styling beyond marks: line spacing, first-line indent, font family, letter case. */
  style: StyleChange
  /** An academic preset the user asked to format with ("format in APA style"), as its preset key. */
  preset: string | null
}

export type TargetMode = 'literal' | 'heading' | 'section' | 'title'

export type TargetCategory = 'headings' | 'sections' | 'paragraphs' | 'chapters' | 'questions' | 'all'

/** Styling a chat request can set besides marks, headings, lists and alignment. */
export interface StyleChange {
  /** Line height as a multiple (1 = single, 1.5, 2 = double). */
  lineSpacing: number | null
  /** First-line indent in inches. */
  firstLineIndentIn: number | null
  /** Font family name, e.g. "Times New Roman". */
  fontFamily: string | null
  /** Letter case to convert the text to. */
  textCase: 'upper' | 'title' | null
}

/** True when a style change asks for anything. */
export function hasStyleChange(style: StyleChange): boolean {
  return style.lineSpacing !== null || style.firstLineIndentIn !== null || style.fontFamily !== null || style.textCase !== null
}

/** Options that make target detection document-aware. */
export interface ParseOptions {
  /** Section titles that exist in the open document (its outline), matched without quotes. */
  knownTitles?: readonly string[]
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
  'the document',
  'my document',
  'the paper',
  'my paper',
  'the manuscript',
  'throughout',
]

/** Section headings named as a group: plural, or singular with "the/all/every/each". */
const SECTION_CATEGORY_PATTERN =
  /\b(?:section\s+(?:headings|titles|headers)|sub-?headings)\b|\b(?:all|every|each|the)\s+(?:the\s+)?(?:section\s+(?:heading|title|header)|sub-?heading)\b/

/**
 * Heading nouns that name WHICH blocks to change ("bold the chapter headings",
 * "the section heading"), not a heading level to apply. They are removed before
 * format matching so "bold the section headings" does not also mean "make them
 * Heading 2". A singular "a section heading" stays a format request.
 */
const CATEGORY_NOUN_PATTERN = new RegExp(
  `${SECTION_CATEGORY_PATTERN.source}|\\b(?:chapter\\s+(?:headings?|titles?|headers?))\\b|\\b(?:all|every|each|the)\\s+(?:the\\s+)?headings\\b`,
  'g'
)

/**
 * Detect whether a bulk request names a specific block category. Plural or
 * quantified forms ("all headings", "every paragraph") count; singular
 * references ("this heading") do not — those keep selection scope.
 */
function detectTargetCategory(message: string): TargetCategory {
  // "all the chapter headings" names chapters only, not every heading level.
  if (/\bchapter\s+(?:headings?|titles?|headers?)\b|\b(?:all|every|each)\s+(?:the\s+)?chapters?\b/.test(message)) {
    return 'chapters'
  }
  // "the research questions" / "number the questions": the questions a study answers.
  if (/\b(?:research\s+|sub-?)?questions\b|\bsops?\b/.test(message)) return 'questions'
  // "the section headings" / "all subheadings": the headings under the chapters.
  if (SECTION_CATEGORY_PATTERN.test(message)) return 'sections'
  const headingsPattern =
    /\bheadings\b|\b(?:all|every|each)\s+title\b|\b(?:all|every|each)\s+h[123]\b/
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
  'certification',
  'glossary',
  'bibliography',
  'appendices',
  'table of contents',
  'list of tables',
  'list of figures',
  'definition of terms',
  // Thesis and capstone sections students name without quotes.
  'background of the study',
  'statement of the problem',
  'significance of the study',
  'scope and delimitation',
  'scope and delimitations',
  'scope and limitation',
  'scope and limitations',
  'scope and limitations of the study',
  'scope and delimitation of the study',
  'conceptual framework',
  'theoretical framework',
  'research paradigm',
  'review of related literature',
  'review of related literature and studies',
  'related literature',
  'related studies',
  'synthesis',
  'research design',
  'research methodology',
  'research locale',
  'research environment',
  'research respondents',
  'respondents of the study',
  'research instrument',
  'research instruments',
  'data gathering procedure',
  'data gathering procedures',
  'statistical treatment',
  'statistical treatment of data',
  'objectives of the study',
  'general objective',
  'specific objectives',
  'rationale of the study',
  'rationale',
  'hypothesis',
  'hypotheses',
  'summary of findings',
  'conclusions',
  'recommendations',
  'curriculum vitae',
] as const

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Section titles a request can name without quotes: the open document's own
 * outline plus the standard academic names, longest first so the most specific
 * title wins. Exported so the request splitter keeps them in one piece.
 */
export function namedTitles(knownTitles: readonly string[] = []): string[] {
  const fromDocument = knownTitles
    .map((title) => title.toLowerCase().replace(/\s+/g, ' ').replace(/[:.]+$/, '').trim())
    // Specific enough to name, and not a figure or table caption.
    .filter((title) => title.length >= 6 && title.length <= 80 && /[a-z]/.test(title) && !/^(?:figure|table)\s+\d/.test(title))
  return [...new Set([...fromDocument, ...KNOWN_SECTION_NAMES])].sort((a, b) => b.length - a.length)
}

/** True when the whole candidate is a known section name. */
function isKnownSection(candidate: string): boolean {
  return KNOWN_SECTION_NAMES.some((name) => name === candidate.toLowerCase())
}

/** A detected target and how it should be applied. */
interface DetectedTarget {
  target: string
  mode: TargetMode
}

/**
 * Detect an explicit target. A quoted phrase means exactly those words
 * (literal); a chapter/section reference or standard section name means the
 * whole section (heading plus everything under it); "the title" means the
 * document title.
 */
function detectTarget(message: string, knownTitles: readonly string[]): DetectedTarget | null {
  // 1. Quoted targets have highest priority. Boundary checks avoid treating
  // an apostrophe in a contraction ("don't") as an opening quote.
  const doubleQuoted = message.match(/"([^"]{2,80})"/)
  if (doubleQuoted) return { target: doubleQuoted[1].trim(), mode: 'literal' }

  const singleQuoted = message.match(/(?:^|[\s(\[{,;:])'([^']{2,80})'(?=$|[\s)\]}.,;:!?])/)
  if (singleQuoted) return { target: singleQuoted[1].trim(), mode: 'literal' }

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
      return { target: candidate, mode: isKnownSection(candidate) ? 'section' : 'literal' }
    }
  }

  // 3. Chapter references.
  const chapterMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?chapter\s+([0-9]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/)
  if (chapterMatch) {
    const number = NUMBER_WORDS[chapterMatch[1]] ?? chapterMatch[1]
    return { target: `chapter ${number}`, mode: 'section' }
  }

  // 4. Section references.
  const sectionMatch = message.match(/(?:entire\s+|whole\s+|full\s+)?section\s+([0-9]{1,2}|one|two|three|four|five)\b/)
  if (sectionMatch) {
    const number = NUMBER_WORDS[sectionMatch[1]] ?? sectionMatch[1]
    return { target: `section ${number}`, mode: 'section' }
  }

  // 5. A section title from the open document or a standard academic name, longest first.
  const titleMatch = namedTitles(knownTitles).find((title) =>
    new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(title)}(?:$|[^a-z0-9])`).test(message)
  )
  if (titleMatch) return { target: titleMatch, mode: 'section' }

  // 6. The document title ("center the title", "make the title bold").
  // "this title heading" is a normal selection request, so require "the/my" or "document title".
  if (/\b(?:(?:the|my)\s+(?:document\s+|paper\s+|manuscript\s+)?|(?:document|paper|manuscript)\s+)title\b(?!\s+(?:page|heading))/.test(message)) {
    return { target: 'title', mode: 'title' }
  }
  return null
}

/** Phrases that name Heading 1 itself, as opposed to "as heading" / "make heading". */
const EXPLICIT_HEADING1_PHRASES = ['heading 1', 'h1', 'main heading', 'title heading'] as const

/** Font families students ask for by name, with their display spelling. */
const FONT_FAMILIES = [
  'Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Garamond', 'Helvetica', 'Verdana', 'Tahoma',
  'Century Gothic', 'Book Antiqua', 'Bookman Old Style', 'Palatino Linotype', 'Courier New', 'Segoe UI', 'Trebuchet MS',
] as const

/** Line spacing a request asks for, as a multiple of the font size. */
function detectLineSpacing(message: string): number | null {
  const numeric = message.match(/\b(?:line[\s-]?)?spac(?:ing|ed|e)\s*(?:of|to|at|=|:)?\s*([1-3](?:\.\d{1,2})?)(?![\d.]|\s*(?:pt|px|in|cm))/)
  if (numeric && /\bspac(?:ing|ed|e)\b/.test(message) && !/\bparagraph\s+spacing\b/.test(message.slice(0, numeric.index ?? 0) + numeric[0])) {
    return Number.parseFloat(numeric[1])
  }
  if (/\bdouble[\s-]?spac\w*|\bdouble line spacing\b|\bline spacing (?:of |to |at )?double\b/.test(message)) return 2
  if (/\b(?:1\.5|one and a half)[\s-]?(?:line[\s-]?)?spac\w*/.test(message)) return 1.5
  if (/\bsingle[\s-]?spac\w*|\bline spacing (?:of |to |at )?single\b/.test(message)) return 1
  return null
}

/** First-line indent a request asks for, in inches (0.5in when no amount is given). */
function detectFirstLineIndent(message: string): number | null {
  if (!/\bindent(?:ation|ed|s)?\b/.test(message)) return null
  if (/\b(?:remove|no|without|clear|undo)\s+(?:the\s+|any\s+)?(?:first[\s-]?line\s+)?indent/.test(message)) return null
  const inches = message.match(/(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?\b|")/)
  if (inches) return Number.parseFloat(inches[1])
  const centimetres = message.match(/(\d+(?:\.\d+)?)\s*cm\b/)
  if (centimetres) return Math.round((Number.parseFloat(centimetres[1]) / 2.54) * 100) / 100
  if (/\bhalf(?:\s+an)?\s+inch\b/.test(message)) return 0.5
  return 0.5
}

/** A font family named in the request ("Times New Roman"), in its display spelling. */
function detectFontFamily(message: string): string | null {
  return FONT_FAMILIES.find((font) => message.includes(font.toLowerCase())) ?? null
}

/** Letter case a request asks for: capitals ("capitalize", "all caps") or title case. */
function detectTextCase(message: string): 'upper' | 'title' | null {
  if (/\btitle[\s-]?case\b|\bcapitali[sz]e (?:the )?first letters?\b|\bcapitali[sz]e each word\b/.test(message)) return 'title'
  if (/\bcapitali[sz]e\w*\b|\bupper[\s-]?case\b|\ball[\s-]?caps\b|\ball capital(?:s| letters)?\b|\bin caps\b/.test(message)) return 'upper'
  return null
}

/** Styling beyond marks and headings that a request asks for. */
function detectStyle(message: string): StyleChange {
  return {
    lineSpacing: detectLineSpacing(message),
    firstLineIndentIn: detectFirstLineIndent(message),
    fontFamily: detectFontFamily(message),
    textCase: detectTextCase(message),
  }
}

/**
 * An academic preset named as the way to format the document ("format in APA
 * style", "use the IEEE format"). Citation requests ("cite this in APA") are not
 * preset requests.
 */
function detectPreset(message: string): string | null {
  if (/\bcit(?:e|es|ing|ation|ations)\b|\breferences?\b|\bbibliograph/.test(message)) return null
  if (/\bapa\b/.test(message)) return 'apa_7th'
  if (/\bieee\b/.test(message)) return 'ieee'
  if (/\buclm\b|\bcapstone (?:format|style|preset|template)\b|\bthesis (?:format|style|preset|template)\b/.test(message)) return 'uclm_capstone'
  return null
}

/**
 * True when the message asks something about the document ("What is the main
 * objective of this study?", "How do I cite a website?") rather than asking for
 * a change. Questions are answered, never turned into a formatting preview.
 * Polite requests ("Can you make the title bold?") are still requests.
 */
export function looksLikeQuestion(message: string): boolean {
  const normalized = normalizeMessage(message)
  if (/^(?:can|could|would|will) you\b|^(?:please|pls|kindly)\b/.test(normalized)) return false
  return /^(?:what|what's|whats|why|who|whom|whose|when|where|which|how|is|are|was|were|does|do|did|should|explain|summari[sz]e|describe|tell me|give me|list)\b/.test(normalized)
}

/**
 * Words that mean the whole section, not just its title line ("the entire
 * chapter 2", "everything in the introduction", "the paragraphs of chapter 1").
 */
const WHOLE_SECTION_PATTERN = /\b(?:entire|whole|full|all of|everything in|everything under|body of|content of|contents of|text of|text in|paragraphs (?:of|in|under))\b/

/** Changes that belong to body text, so a named section means everything in it. */
export function isBodyChange(formats: readonly FormattingIntent[], style: StyleChange): boolean {
  return (
    formats.some((format) => ['align_left', 'align_right', 'align_justify', 'unordered_list', 'ordered_list', 'blockquote'].includes(format)) ||
    style.lineSpacing !== null ||
    style.firstLineIndentIn !== null ||
    style.fontFamily !== null
  )
}

/** Parse one or more formatting intents from a natural-language chatbot message. */
export function parseFormattingIntent(
  message: string,
  options: ParseOptions = {}
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
      patterns: ['heading 1', 'h1', 'main heading', 'title heading', 'make heading', 'as heading', 'add heading', 'format as heading', 'make this heading'],
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
      patterns: ['numbered list', 'ordered list', 'number list', 'numbered items', 'numbers', 'numbering', 'number the ', 'number them', 'number each', 'number these', 'number those'],
    },
  ]

  // Heading nouns that only say which blocks to change are not formats.
  const formatText = normalized.replace(CATEGORY_NOUN_PATTERN, ' ').replace(/\s+/g, ' ')
  const matches: Array<{ format: FormattingIntent; phrase: string; confidence: number }> = []

  for (const entry of intentMap) {
    const matchedPhrase = findMatch(formatText, entry.patterns)
    if (matchedPhrase) matches.push({ format: entry.format, phrase: matchedPhrase, confidence: entry.confidence })
  }

  // "Format X as heading 2": the generic "as heading" must not add a Heading 1
  // next to the level the user actually named.
  const namesOtherLevel = matches.some((match) => match.format === 'heading2' || match.format === 'heading3')
  const kept = namesOtherLevel && !findMatch(formatText, EXPLICIT_HEADING1_PHRASES)
    ? matches.filter((match) => match.format !== 'heading1')
    : matches

  const formats: FormattingIntent[] = kept.map((match) => match.format)
  let firstPhrase: string | null = kept[0]?.phrase ?? null
  let firstConfidence = kept[0]?.confidence ?? 0

  // Alignment is detected separately so a message can ask for both a mark and
  // an alignment ("make this bold and center it").
  const alignment = detectAlignment(formatText)
  if (alignment && !formats.includes(alignment.format)) {
    formats.push(alignment.format)
    if (firstPhrase === null) firstPhrase = alignment.phrase
    if (firstConfidence === 0) firstConfidence = ALIGNMENT_CONFIDENCE
  }

  // Style words are read without quoted target text ("bold "Double Space Rules"").
  const style = detectStyle(formatText.replace(/"[^"]*"/g, ' '))
  const detected = detectTarget(normalized, options.knownTitles ?? [])
  const target = detected?.target ?? null
  const targetCategory = detectTargetCategory(normalized)
  // A named section or chapter means its title line, unless the request says the
  // whole section or asks for a body change (spacing, indent, lists, justify).
  const targetMode: TargetMode | null =
    detected?.mode === 'section' && !WHOLE_SECTION_PATTERN.test(normalized) && !isBodyChange(formats, style)
      ? 'heading'
      : (detected?.mode ?? null)
  // Line spacing and font family with no place named mean the document, as in
  // a thesis guideline ("double space", "use Times New Roman"), unless the
  // message points at the selection.
  const documentWideStyle =
    (style.lineSpacing !== null || style.fontFamily !== null) && !/\b(?:this|these|selected|selection|highlighted)\b/.test(normalized)
  // A named category ("all headings") is itself a document-wide request.
  const scope: 'selection' | 'all' =
    target !== null ||
    targetCategory !== 'all' ||
    documentWideStyle ||
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
    targetMode,
    targetCategory,
    style,
    preset: target === null && targetCategory === 'all' ? detectPreset(normalized) : null,
  }
}