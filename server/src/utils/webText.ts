/** Longest page text kept for comparison (characters); the rest of a very long page is ignored. */
const MAX_PAGE_CHARS = 200000

/** Words that start a section whose entries are meant to match published sources. */
const REFERENCE_HEADING = /^(references|bibliography|works cited|literature cited|sources)$/i

/**
 * Headings that mark a preliminary or front-matter section in academic manuscripts and theses.
 * These sections contain formal administrative text, acknowledgments, lists of tables/figures,
 * and tables of contents which are structural or template-based and should not be tested for plagiarism.
 */
const FRONT_MATTER_HEADING =
  /^(table of contents|contents|toc|list of (figures|tables|appendices|plates|illustrations|symbols|abbreviations|acronyms)|approval sheet|certificate of approval|acceptance sheet|certificate of originality|declaration of (originality|authorship)|dedications?|acknowledg(e)?ments?|curriculum vitae|about the authors?|author'?s? profile)$/i

/**
 * Headings that mark the beginning of substantive academic body text. When encountered, any preceding
 * front-matter skipping ends.
 */
const BODY_START_HEADING =
  /^(chapter\s+([0-9ivxlcdm]+|[a-z]+)|\d+(\.\d+)*\s+[a-z]|introduction|abstract|executive summary|background(\s+of\s+the\s+study)?|review of related (literature|systems|studies)|methodology|system (design|architecture|implementation)|results(\s+and\s+discussion)?|discussion|conclusion(s)?(\s+and\s+recommendations)?)\b/i

/**
 * Title page boilerplate phrases common to capstone projects, theses, and dissertations.
 */
const TITLE_PAGE_BOILERPLATE =
  /\b(a (capstone|thesis|dissertation|research paper)(\s+project)?\s+(presented|submitted)|in partial fulfillment|submitted to the faculty|degree of (bachelor|master|doctor)|all rights reserved|republic of the philippines|college of (information|computer|engineering|arts|science))\b/i

/**
 * Structural specification labels, diagram captions, wireframe notes, and storyboard items.
 * In a manuscript, these are diagram captions, UI descriptions, use case steps, or code listings
 * that describe UI elements or program syntax rather than continuous academic prose.
 */
const STRUCTURAL_OR_SPEC_PREFIX =
  /^(storyboard(\s+[\d.a-z]+)?(\s+|[:.-])|screen description(\s+|[:.-])|screen (name|id|title|flow)(\s+|[:.-])|ui mockup(\s+[\d.a-z]+)?(\s+|[:.-])|wireframe(\s+[\d.a-z]+)?(\s+|[:.-])|mockup(\s+[\d.a-z]+)?(\s+|[:.-])|use case(\s+[\d.a-z]+)?(\s+|[:.-])|actor[:.-]|actors[:.-]|pre-?condition[:.-]|post-?condition[:.-]|trigger[:.-]|main flow[:.-]|alternative flow[:.-]|exception flow[:.-]|figure\b|fig\.\b|table\b|tab\.\b|listing\b|algorithm\b|source[:.-]|note[:.-]|notes[:.-]|diagram\b|chart\b)/i

/**
 * Detect lines that resemble code snippets (curly braces, semicolons, programming keywords).
 */
function isCodeOrSyntaxLine(line: string): boolean {
  if (line.length > 200) return false
  if (/^(\s*[{}[\]();<>]+\s*)$/.test(line)) return true
  return (
    /[{};]/.test(line) &&
    /\b(const|let|var|function|class|import|export|return|void|public|private|def|elif|nullptr|std::)\b/.test(line)
  )
}

/**
 * Detect lines that are table-of-contents entries (e.g. "Chapter 1 Introduction ....... 1" or "1.1 Background ..... 12").
 */
function isTocEntry(line: string): boolean {
  return /(\.{2,}|\t|\s{3,})\s*([ivxlcdm]+|\d+)\s*$/i.test(line)
}

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

export interface ScopeOptions {
  scope?: 'all' | 'chapter' | 'pages'
  chapterTitle?: string
  pageStart?: number
  pageEnd?: number
}

/**
 * Slice a document's HTML to a targeted section (specific chapter, page range, or entire document).
 * Slicing enables deep, high-density originality checks on high-risk sections (e.g. Literature Review)
 * in large 100+ page manuscripts while completing in seconds.
 */
export function sliceDocumentContent(html: string, options: ScopeOptions = {}): string {
  const { scope = 'all', chapterTitle, pageStart = 1, pageEnd = 5 } = options
  if (scope === 'all' || !html) return html

  if (scope === 'chapter' && chapterTitle) {
    const cleanTarget = chapterTitle.replace(/<[^>]+>/g, '').trim().toLowerCase()
    // Find all headings
    const headingRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    let targetStart = -1
    let targetEnd = -1
    let targetTag = ''

    while ((match = headingRegex.exec(html)) !== null) {
      const headingText = match[2].replace(/<[^>]+>/g, '').trim().toLowerCase()
      if (targetStart === -1) {
        if (headingText === cleanTarget || headingText.includes(cleanTarget) || cleanTarget.includes(headingText)) {
          targetStart = match.index
          targetTag = match[1].toLowerCase()
        }
      } else {
        // Next heading of same or higher level ends this chapter
        const tag = match[1].toLowerCase()
        if (tag <= targetTag) {
          targetEnd = match.index
          break
        }
      }
    }

    if (targetStart !== -1) {
      return targetEnd === -1 ? html.slice(targetStart) : html.slice(targetStart, targetEnd)
    }
  }

  if (scope === 'pages') {
    const fromPage = Math.max(1, pageStart)
    const toPage = Math.max(fromPage, Math.min(pageEnd, fromPage + 9)) // max 10 pages per check

    // Check for explicit page break markers
    const pageBreakRegex = /<(?:div|hr)[^>]*class="[^"]*(?:intellidocs-page-break|page-break|rm-page-break)[^"]*"[^>]*>(?:<\/(?:div|hr)>)?/gi
    if (pageBreakRegex.test(html)) {
      const pages = html.split(pageBreakRegex)
      if (pages.length > 1) {
        const fromIdx = Math.max(0, fromPage - 1)
        const toIdx = Math.min(pages.length, toPage)
        return pages.slice(fromIdx, toIdx).join('<div class="intellidocs-page-break"></div>')
      }
    }

    // Fallback: estimate pages based on paragraphs (~250 words per academic page)
    const blockRegex = /<(p|h[1-6]|li|blockquote|div)[^>]*>[\s\S]*?<\/\1>/gi
    const blocks: { html: string; words: number }[] = []
    let bMatch: RegExpExecArray | null
    while ((bMatch = blockRegex.exec(html)) !== null) {
      const text = bMatch[0].replace(/<[^>]+>/g, ' ').trim()
      const words = text ? text.split(/\s+/).length : 0
      blocks.push({ html: bMatch[0], words })
    }

    if (blocks.length > 0) {
      let cumulativeWords = 0
      const matchedBlocks: string[] = []
      for (const block of blocks) {
        const pageOfBlock = Math.floor(cumulativeWords / 250) + 1
        if (pageOfBlock >= fromPage && pageOfBlock <= toPage) {
          matchedBlocks.push(block.html)
        }
        cumulativeWords += block.words
        if (pageOfBlock > toPage) break
      }
      if (matchedBlocks.length > 0) {
        return matchedBlocks.join('\n')
      }
    }
  }

  return html
}

/**
 * The paragraphs of a document, one per block, stopping at the reference list: entries there are
 * supposed to match published sources and must not count as copied text.
 * Also filters out front-matter sections (Table of Contents, List of Figures, Dedications,
 * Acknowledgments, Approval Sheets), title page boilerplates, storyboard/screen specs, and code lines.
 */
export function documentParagraphs(html: string): string[] {
  const lines = htmlToLines(html)
  const result: string[] = []
  let inFrontMatter = false

  for (const line of lines) {
    const normalized = line.replace(/^([ivxlcdm]+|\d+)[\s.]+/i, '').trim()

    // 1. Stop at the reference list / bibliography: citations must not count as copied text.
    if (REFERENCE_HEADING.test(normalized)) {
      break
    }

    // 2. Identify front-matter section headings.
    if (FRONT_MATTER_HEADING.test(normalized)) {
      inFrontMatter = true
      continue
    }

    // 3. Skip standalone or embedded TOC entries (e.g. lines with leader dots / trailing page numbers).
    if (isTocEntry(line)) {
      continue
    }

    // 4. Skip title page boilerplates (e.g. "In partial fulfillment of the requirements...").
    if (TITLE_PAGE_BOILERPLATE.test(line)) {
      continue
    }

    // 5. Identify body start headings: ends front-matter skipping.
    if (BODY_START_HEADING.test(normalized)) {
      inFrontMatter = false
      result.push(line)
      continue
    }

    // 6. While in front-matter mode, skip entries unless an obvious narrative body paragraph resumes.
    if (inFrontMatter) {
      if (line.split(/\s+/).length > 25 && /[.!?]/.test(line)) {
        inFrontMatter = false
      } else {
        continue
      }
    }

    // 7. Skip structural specifications, storyboard descriptions, captions, and code lines.
    if (STRUCTURAL_OR_SPEC_PREFIX.test(line) || isCodeOrSyntaxLine(line)) {
      continue
    }

    result.push(line)
  }

  return result
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

/** True for lines that make poor search queries: links, emails, storyboard specs, captions, number-heavy text. */
function isPoorQuery(sentence: string): boolean {
  if (/https?:\/\/|www\.|@/.test(sentence)) return true
  if (STRUCTURAL_OR_SPEC_PREFIX.test(sentence)) return true
  if (TITLE_PAGE_BOILERPLATE.test(sentence)) return true
  if (FRONT_MATTER_HEADING.test(sentence.replace(/^([ivxlcdm]+|\d+)[\s.]+/i, '').trim())) return true
  if (
    /(wireframe|storyboard|mockup)\b/i.test(sentence) &&
    /\b(screen|button|field|input|click|interface|dialog)\b/i.test(sentence)
  ) {
    return true
  }
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
