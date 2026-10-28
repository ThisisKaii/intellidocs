/** Longest page text kept for comparison (characters); the rest of a very long page is ignored. */
const MAX_PAGE_CHARS = 200000

/** Words that start a section whose entries are meant to match published sources. */
const REFERENCE_HEADING = /^(references|bibliography|works cited|literature cited|sources)$/i

/** Decode the few HTML entities that matter for comparing text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
}

/** Turn HTML into plain text lines: block ends become line breaks, tags are dropped. */
function htmlToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<\/(p|h[1-6]|li|div|tr|section|article|blockquote)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

/**
 * The paragraphs of a document, one per block, stopping at the reference list: entries there are
 * supposed to match published sources and must not count as copied text.
 */
export function documentParagraphs(html: string): string[] {
  const lines = htmlToLines(html)
  const end = lines.findIndex((line) => REFERENCE_HEADING.test(line.replace(/^[\d.\s]+/, '')))
  return end === -1 ? lines : lines.slice(0, end)
}

/** The readable text of a web page: scripts, styles and page furniture are removed first. */
export function pageText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|nav|header|footer|aside|form|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  return htmlToLines(body).join('\n').slice(0, MAX_PAGE_CHARS)
}

/** Split text into sentences at ., ! or ? followed by a space. */
function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
}

/** True for lines that make poor search queries: links, emails, figure captions, number-heavy text. */
function isPoorQuery(sentence: string): boolean {
  if (/https?:\/\/|www\.|@/.test(sentence)) return true
  if (/^(figure|fig\.|table|source|note)\b/i.test(sentence)) return true
  const digits = (sentence.match(/\d/g) ?? []).length
  return digits / sentence.length > 0.12
}

/**
 * Pick sentences spread evenly through the document and cut each to a short phrase. Exact-phrase
 * searches on a few distinctive passages are how copied text is found on the web.
 */
export function pickQueryPhrases(paragraphs: string[], count: number, words: number = 12): string[] {
  const candidates = paragraphs
    .flatMap(sentences)
    .filter((sentence) => {
      const length = sentence.split(/\s+/).length
      return length >= words + 2 && length <= 60 && !isPoorQuery(sentence)
    })
  if (candidates.length === 0) return []

  const picked: string[] = []
  const step = candidates.length / Math.min(count, candidates.length)
  for (let i = 0; i < Math.min(count, candidates.length); i += 1) {
    const sentence = candidates[Math.floor(i * step)]
    // Skip the first two words: sentence openers are the least distinctive part.
    const phrase = sentence
      .replace(/["“”]/g, '')
      .split(/\s+/)
      .slice(2, 2 + words)
      .join(' ')
      .replace(/[.,;:!?]+$/, '')
    if (!picked.includes(phrase)) picked.push(phrase)
  }
  return picked
}
