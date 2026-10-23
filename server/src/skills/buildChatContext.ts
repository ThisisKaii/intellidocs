import { listOutlineSections } from './documentSections'

interface ChatContextInput {
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
const OUTLINE_LIMIT = 60

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

/** Build a natural-language, document-aware context block for AI chat prompts. */
export function buildChatContext(input: ChatContextInput): string {
  const rawContent = input.documentContent ?? ''
  // The editor appends a "Document outline:" block listing every section; keep it
  // whole (the excerpts below are short) and leave it out of the excerpt text.
  const outline = listOutlineSections(rawContent).slice(0, OUTLINE_LIMIT)
  const outlineStart = rawContent.indexOf('Document outline:')
  const contentWithoutOutline = outlineStart === -1 ? rawContent : rawContent.slice(0, outlineStart)
  const plainText = htmlToPlainText(contentWithoutOutline)
  const normalizedText = plainText.replace(/\s+/g, ' ').trim()
  const paragraphs = getParagraphs(plainText)
  const headings = getHeadingCandidates(paragraphs)
  const stats = getDocumentStats(normalizedText, paragraphs, headings)
  const openingExcerpt = normalizedText.slice(0, OPENING_EXCERPT_LIMIT)
  const recentExcerpt =
    normalizedText.length > OPENING_EXCERPT_LIMIT
      ? normalizedText.slice(Math.max(normalizedText.length - RECENT_EXCERPT_LIMIT, 0))
      : ''

  const title = input.documentTitle?.trim()
  const parts: string[] = [
    title
      ? `The user is working in a document titled "${title}".`
      : 'The user is working in an untitled document.',
  ]

  if (stats.wordCount === 0) {
    parts.push('The document is currently empty.')
    return parts.join('\n\n')
  }

  const headingNote =
    stats.headingCount > 0
      ? ` with ${stats.headingCount} section-like heading${stats.headingCount === 1 ? '' : 's'}`
      : ''
  parts.push(
    `It currently contains about ${stats.wordCount} words across ${stats.paragraphCount} paragraphs${headingNote}.`
  )

  if (outline.length > 0) {
    parts.push(
      `The document contains these sections, in order (so each of them exists even if its text is not excerpted below): ${outline
        .map((section: string): string => `"${section}"`)
        .join(', ')}.`
    )
  } else if (headings.length > 0) {
    parts.push(`Likely section headings: ${headings.map((heading: string): string => `"${heading}"`).join(', ')}.`)
  }

  parts.push(`Opening excerpt:\n${openingExcerpt}`)
  if (recentExcerpt) parts.push(`Recent excerpt:\n${recentExcerpt}`)

  return parts.join('\n\n')
}