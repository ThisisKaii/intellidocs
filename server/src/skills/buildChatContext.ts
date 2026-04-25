interface ChatContextInput {
  documentId?: string
  documentTitle?: string
  documentContent?: string
}

interface DocumentStats {
  wordCount: number
  paragraphCount: number
  headingCount: number
  characterCount: number
}

const OPENING_EXCERPT_LIMIT = 1200
const RECENT_EXCERPT_LIMIT = 700
const HEADING_LIMIT = 8

/** Decode common HTML entities that appear in saved editor content. */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  }

  return text.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
    (entity: string): string => entities[entity] ?? entity
  )
}

/** Convert saved editor HTML into plain text while preserving block breaks. */
function htmlToPlainText(content: string): string {
  return decodeHtmlEntities(content)
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Split document text into meaningful paragraph-like chunks. */
function getParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph: string): string => paragraph.trim())
    .filter((paragraph: string): boolean => paragraph.length > 0)
}

/** Extract heading-like lines from the document for better chat grounding. */
function getHeadingCandidates(paragraphs: string[]): string[] {
  return paragraphs
    .filter((paragraph: string): boolean => {
      const words = paragraph.split(/\s+/)
      const startsLikeHeading = /^(#{1,6}\s+|[A-Z][^.!?]{2,80}$)/.test(paragraph)
      return words.length <= 12 && startsLikeHeading
    })
    .slice(0, HEADING_LIMIT)
}

/** Count basic document statistics for prompt context. */
function getDocumentStats(text: string, paragraphs: string[], headings: string[]): DocumentStats {
  const words = text.match(/\b[\w']+\b/g) ?? []

  return {
    wordCount: words.length,
    paragraphCount: paragraphs.length,
    headingCount: headings.length,
    characterCount: text.length,
  }
}

/** Format a list for inclusion in the provider system prompt. */
function formatList(label: string, entries: string[]): string {
  if (entries.length === 0) {
    return `${label}: unavailable`
  }

  return `${label}:\n${entries.map((entry: string): string => `- ${entry}`).join('\n')}`
}

/** Build a compact, document-aware context block for AI chat prompts. */
export function buildChatContext(input: ChatContextInput): string {
  const plainText = htmlToPlainText(input.documentContent ?? '')
  const normalizedText = plainText.replace(/\s+/g, ' ').trim()
  const paragraphs = getParagraphs(plainText)
  const headings = getHeadingCandidates(paragraphs)
  const stats = getDocumentStats(normalizedText, paragraphs, headings)
  const openingExcerpt = normalizedText.slice(0, OPENING_EXCERPT_LIMIT)
  const recentExcerpt =
    normalizedText.length > OPENING_EXCERPT_LIMIT
      ? normalizedText.slice(Math.max(normalizedText.length - RECENT_EXCERPT_LIMIT, 0))
      : ''

  return [
    input.documentId?.trim()
      ? `Document ID: ${input.documentId.trim()}`
      : 'Document ID: unavailable',
    input.documentTitle?.trim()
      ? `Document title: ${input.documentTitle.trim()}`
      : 'Document title: unavailable',
    `Word count: ${stats.wordCount}`,
    `Paragraph count: ${stats.paragraphCount}`,
    `Heading count: ${stats.headingCount}`,
    `Character count: ${stats.characterCount}`,
    formatList('Detected headings or section-like lines', headings),
    openingExcerpt ? `Opening excerpt:\n${openingExcerpt}` : 'Opening excerpt: unavailable',
    recentExcerpt ? `Recent excerpt:\n${recentExcerpt}` : undefined,
  ]
    .filter((entry: string | undefined): entry is string => typeof entry === 'string')
    .join('\n\n')
}