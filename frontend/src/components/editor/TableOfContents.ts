/** Table of Contents extraction and rendering utilities. */

export interface TOCEntry {
  id: string
  level: number
  text: string
  pageNumber: number | null
  element?: HTMLElement
}

export interface TOCConfig {
  maxDepth: 1 | 2 | 3
  includePageNumbers: boolean
  showDotLeaders: boolean
  includeTables: boolean
  includeFigures: boolean
}

/** Default TOC configuration. */
export const DEFAULT_TOC_CONFIG: TOCConfig = {
  maxDepth: 3,
  includePageNumbers: true,
  showDotLeaders: true,
  includeTables: false,
  includeFigures: false,
}

/**
 * Extract headings from HTML content and build TOC entries.
 * Returns an array of TOCEntry objects with heading text, level, and placeholder page numbers.
 * Page numbers are resolved by the paginated editor and passed back via updateTOCPageNumbers.
 */
export function extractTOCFromHTML(html: string): Omit<TOCEntry, 'pageNumber' | 'element'>[] {
  const entries: Omit<TOCEntry, 'pageNumber' | 'element'>[] = []
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10)
    if (level > 3) continue
    const rawText = match[2]
    const text = decodeEntities(rawText.replace(/<[^>]*>/g, '')).trim()
    if (!text) continue
    const id = `toc-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${entries.length}`
    entries.push({ id, level, text })
  }

  // Bold all-caps structural blocks (APPROVAL SHEET, ABSTRACT, CHAPTER I, ...)
  // act as level-1 sections even when an importer left them as styled
  // paragraphs rather than real headings (guide Task 5). Deduped against the
  // headings captured above so a real <h1> is never listed twice.
  const seen = new Set(entries.map((entry) => entry.text.replace(/\s+/g, ' ').toLowerCase()))
  const structuralRegex =
    /^(CHAPTER\s+[IVXLCDM0-9]+|INTRODUCTION|ABSTRACT|ACKNOWLEDGEMENTS?|APPROVAL SHEET|TABLE OF CONTENTS|LIST OF TABLES|LIST OF FIGURES|REFERENCES|BIBLIOGRAPHY|APPENDICES|RECOMMENDATIONS?)\b/i
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  while ((match = paragraphRegex.exec(html)) !== null) {
    const inner = match[1]
    if (!/<(?:strong|b)[\s>]/i.test(inner)) continue
    const text = decodeEntities(inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    if (!text || text.length > 80 || !structuralRegex.test(text)) continue
    const normalized = text.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const id = `toc-${normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${entries.length}`
    entries.push({ id, level: 1, text })
  }

  return entries
}

/** Decode the HTML entities the regex extractors leave in captured text ("&amp;" -> "&"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Build a stable entry id from a label and index. */
function tocId(prefix: string, text: string, index: number): string {
  return `${prefix}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${index}`
}

/** Read one attribute value from a tag's raw HTML, or null when absent. */
function attrOf(tagHtml: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tagHtml)
  return match ? match[1].trim() : null
}

/**
 * Extract tables for the List of Tables. Matches ANY `<table>`, not just the
 * academic-table node: the caption comes from its `<caption>` element, the
 * nearest "Table N:" label in the surrounding text, or a generated fallback.
 */
export function extractTablesFromHTML(html: string): Omit<TOCEntry, 'pageNumber' | 'element'>[] {
  const entries: Omit<TOCEntry, 'pageNumber' | 'element'>[] = []
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let match: RegExpExecArray | null

  while ((match = tableRegex.exec(html)) !== null) {
    const inner = match[1]
    const captionMatch = inner.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)
    let text = captionMatch ? decodeEntities(captionMatch[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : ''
    if (!text) {
      // Look just above the table for a "Table 3: Whatever" label paragraph.
      const before = html.slice(Math.max(0, (match.index ?? 0) - 400), match.index ?? 0)
      const label = /Table\s+\d+\s*[:.]\s*[^<]{1,140}/i.exec(before)
      text = label ? label[0].replace(/\s+/g, ' ').trim() : `Table ${entries.length + 1}`
    }
    entries.push({ id: tocId('lot', text, entries.length), level: 1, text })
  }

  return entries
}

/**
 * Extract figures for the List of Figures. Matches academic `<figure>` blocks
 * and plain `<img>` elements alike: captions come from `<figcaption>`, the
 * image's `alt`/`title`, a nearby "Figure N:" label, or a generated fallback.
 */
export function extractFiguresFromHTML(html: string): Omit<TOCEntry, 'pageNumber' | 'element'>[] {
  const entries: Omit<TOCEntry, 'pageNumber' | 'element'>[] = []
  const figureRanges: Array<[number, number]> = []
  const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi
  let match: RegExpExecArray | null

  while ((match = figureRegex.exec(html)) !== null) {
    figureRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length])
    const inner = match[1]
    const captionMatch = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)
    let text = captionMatch ? decodeEntities(captionMatch[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : ''
    if (!text) {
      const imgMatch = /<img[^>]*>/i.exec(inner)
      const alt = imgMatch ? attrOf(imgMatch[0], 'alt') : null
      text = alt || `Figure ${entries.length + 1}`
    }
    entries.push({ id: tocId('lof', text, entries.length), level: 1, text })
  }

  // Standalone images (the editor's standard image node renders as a bare
  // <img>) — skipped when they fall inside an already-counted <figure>.
  const imgRegex = /<img[^>]*>/gi
  while ((match = imgRegex.exec(html)) !== null) {
    const index = match.index ?? 0
    if (figureRanges.some(([from, to]) => index >= from && index < to)) continue
    const alt = attrOf(match[0], 'alt') || attrOf(match[0], 'title')
    let text = alt ?? ''
    if (!text) {
      const before = html.slice(Math.max(0, index - 400), index)
      const label = /Figure\s+\d+\s*[:.]\s*[^<]{1,140}/i.exec(before)
      text = label ? label[0].replace(/\s+/g, ' ').trim() : `Figure ${entries.length + 1}`
    }
    entries.push({ id: tocId('lof', text, entries.length), level: 1, text })
  }

  return entries
}

/**
 * Update TOC entries with actual page numbers from the paginated editor.
 * Called by PagedEditor after pagination is computed.
 */
export function updateTOCPageNumbers(
  entries: TOCEntry[],
  pageElements: HTMLElement[]
): TOCEntry[] {
  return entries.map((entry) => {
    if (entry.element) {
      const rect = entry.element.getBoundingClientRect()
      const pageIndex = pageElements.findIndex((page) => {
        const pageRect = page.getBoundingClientRect()
        return rect.top >= pageRect.top && rect.top < pageRect.bottom
      })
      return { ...entry, pageNumber: pageIndex >= 0 ? pageIndex + 1 : null }
    }
    return entry
  })
}

/**
 * Generate dot leader string for CSS-based dot leaders.
 * The actual dot leaders are rendered via CSS flex layout.
 */
export function generateDotLeader(): string {
  return ' . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . '
}