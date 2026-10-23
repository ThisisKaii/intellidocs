/** Citation reference types and the formatting rules for IEEE, APA 7, MLA 9 and Chicago (author-date). */

export type CitationStyle = 'ieee' | 'apa' | 'mla' | 'chicago'

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  ieee: 'IEEE  [1]',
  apa: 'APA 7  (Author, Year)',
  mla: 'MLA 9  (Author page)',
  chicago: 'Chicago  (Author Year)',
}

export interface CitationReference {
  id: string
  type: 'journal' | 'book' | 'conference' | 'website' | 'thesis' | 'report' | 'other'
  /** Names as "Given Family", one per entry. */
  authors: string[]
  title: string
  year: number
  venue?: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  url?: string
  publisher?: string
  /** IEEE order: 1 for the first source cited in the text, 2 for the next, and so on. */
  cited?: number
}

/** The saved citation settings of one document. */
export interface CitationData {
  style: CitationStyle
  references: CitationReference[]
}

/** Escape text that came from a user or a lookup before it goes into formatted HTML. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Last name of an author written "Given Family". */
function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ''
}

/** Split "Given Middle Family" into its given names and family name. */
function splitName(name: string): { given: string[]; family: string } {
  const parts = name.trim().split(/\s+/)
  const family = parts.pop() ?? ''
  return { given: parts, family }
}

/** "J. A. Smith" (IEEE). */
function ieeeName(name: string): string {
  const { given, family } = splitName(name)
  if (given.length === 0) return family
  return `${given.map((part) => `${part[0].toUpperCase()}.`).join(' ')} ${family}`
}

/** "Smith, J. A." (APA). */
function apaName(name: string): string {
  const { given, family } = splitName(name)
  if (given.length === 0) return family
  return `${family}, ${given.map((part) => `${part[0].toUpperCase()}.`).join(' ')}`
}

/** "Smith, Jane A." for the first author, "Jane A. Smith" for the others (MLA and Chicago). */
function fullName(name: string, first: boolean): string {
  const { given, family } = splitName(name)
  if (given.length === 0) return family
  return first ? `${family}, ${given.join(' ')}` : `${given.join(' ')} ${family}`
}

/** Join a list of names with commas and a final "and"/"&". */
function joinList(names: string[], last: string): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${last} ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, ${last} ${names[names.length - 1]}`
}

/** MLA/Chicago list: "Smith, Jane, and Omar Khan" — the inverted first name always takes a comma before "and". */
function joinInverted(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** Authors line for a bibliography entry in the given style. */
function authorsFor(style: CitationStyle, authors: string[]): string {
  if (authors.length === 0) return ''
  switch (style) {
    case 'ieee':
      return authors.length > 6 ? `${ieeeName(authors[0])} et al.` : joinList(authors.map(ieeeName), 'and')
    case 'apa': {
      if (authors.length > 20) {
        return `${authors.slice(0, 19).map(apaName).join(', ')}, ... ${apaName(authors[authors.length - 1])}`
      }
      const names = authors.map(apaName)
      return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`
    }
    case 'mla':
      if (authors.length > 2) return `${fullName(authors[0], true)}, et al.`
      return joinInverted(authors.map((name, index) => fullName(name, index === 0)))
    default:
      if (authors.length > 10) return `${fullName(authors[0], true)}, et al.`
      return joinInverted(authors.map((name, index) => fullName(name, index === 0)))
  }
}

/** Author surnames for an in-text citation: "Smith", "Smith and Jones", "Smith et al.". */
function surnamesFor(style: CitationStyle, authors: string[]): string {
  if (authors.length === 0) return 'Anonymous'
  const names = authors.map(lastNameOf)
  if (names.length === 1) return names[0]
  const connector = style === 'apa' ? '&' : 'and'
  const limit = style === 'apa' ? 2 : 2
  if (names.length === limit) return `${names[0]} ${connector} ${names[1]}`
  return `${names[0]} et al.`
}

/** The in-text marker for a source, e.g. "[2]" or "(Smith, 2021, p. 4)". */
export function formatInTextCitation(
  ref: CitationReference,
  style: CitationStyle,
  options?: { ordinal?: number; page?: string }
): string {
  const page = options?.page?.trim()
  if (style === 'ieee') {
    return `[${options?.ordinal ?? ref.cited ?? '?'}]`
  }
  const who = escapeHtml(surnamesFor(style, ref.authors))
  if (style === 'apa') return `(${who}, ${ref.year}${page ? `, p. ${escapeHtml(page)}` : ''})`
  if (style === 'mla') return `(${who}${page ? ` ${escapeHtml(page)}` : ''})`
  return `(${who} ${ref.year}${page ? `, ${escapeHtml(page)}` : ''})`
}

/** Source link shown at the end of an entry: DOI first, then URL. */
function locatorFor(ref: CitationReference, style: CitationStyle): string {
  if (ref.doi) return `https://doi.org/${escapeHtml(ref.doi)}`
  if (ref.url) {
    const url = escapeHtml(ref.url)
    if (style === 'ieee') return `Available: ${url}`
    return url
  }
  return ''
}

/** Italic wrapper used for titles of whole works and journals. */
const italic = (value: string): string => `<i>${escapeHtml(value)}</i>`

/** One bibliography entry as HTML, in the given style. `number` is the IEEE list number. */
export function formatBibliographyEntry(ref: CitationReference, style: CitationStyle, number?: number): string {
  const authors = escapeHtml(authorsFor(style, ref.authors))
  const title = escapeHtml(ref.title)
  const isWholeWork = ref.type === 'book' || ref.type === 'report' || ref.type === 'thesis'
  const venue = ref.venue ? ref.venue : ''
  const locator = locatorFor(ref, style)
  const pages = ref.pages ? escapeHtml(ref.pages.replace(/-/g, '–')) : ''

  if (style === 'ieee') {
    const head = `${number != null ? `[${number}] ` : ''}${authors ? `${authors}, ` : ''}${isWholeWork ? italic(ref.title) : `"${title},"`}`
    const tail: string[] = []
    if (!isWholeWork && venue) tail.push(italic(venue))
    if (ref.volume) tail.push(`vol. ${escapeHtml(ref.volume)}`)
    if (ref.issue) tail.push(`no. ${escapeHtml(ref.issue)}`)
    if (pages) tail.push(`pp. ${pages}`)
    if (isWholeWork && ref.publisher) tail.push(escapeHtml(ref.publisher))
    tail.push(String(ref.year))
    const ending = ref.doi ? ` doi: ${escapeHtml(ref.doi)}` : locator ? ` ${locator}` : ''
    return `${head}${isWholeWork ? ', ' : ' '}${tail.join(', ')}.${ending}`
  }

  if (style === 'apa') {
    const lead = `${authors ? `${authors} ` : ''}(${ref.year}). `
    let body = isWholeWork ? `${italic(ref.title)}.` : `${title}.`
    if (!isWholeWork && venue) {
      body += ` ${italic(venue)}`
      if (ref.volume) body += `, ${italic(ref.volume)}`
      if (ref.issue) body += `(${escapeHtml(ref.issue)})`
      if (pages) body += `, ${pages}`
      body += '.'
    } else if (ref.publisher) {
      body += ` ${escapeHtml(ref.publisher)}.`
    }
    return `${lead}${body}${locator ? ` ${locator}` : ''}`
  }

  if (style === 'mla') {
    const lead = authors ? `${authors.replace(/\.$/, '')}. ` : ''
    let body = isWholeWork ? `${italic(ref.title)}.` : `"${title}."`
    if (!isWholeWork && venue) {
      const bits = [italic(venue)]
      if (ref.volume) bits.push(`vol. ${escapeHtml(ref.volume)}`)
      if (ref.issue) bits.push(`no. ${escapeHtml(ref.issue)}`)
      bits.push(String(ref.year))
      if (pages) bits.push(`pp. ${pages}`)
      body += ` ${bits.join(', ')}.`
    } else {
      body += ` ${ref.publisher ? `${escapeHtml(ref.publisher)}, ` : ''}${ref.year}.`
    }
    return `${lead}${body}${locator ? ` ${locator}.` : ''}`
  }

  // Chicago author-date
  const lead = authors ? `${authors.replace(/\.$/, '')}. ` : ''
  let body = `${ref.year}. ${isWholeWork ? `${italic(ref.title)}.` : `"${title}."`}`
  if (!isWholeWork && venue) {
    body += ` ${italic(venue)}`
    if (ref.volume) body += ` ${escapeHtml(ref.volume)}`
    if (ref.issue) body += ` (${escapeHtml(ref.issue)})`
    if (pages) body += `: ${pages}`
    body += '.'
  } else if (ref.publisher) {
    body += ` ${escapeHtml(ref.publisher)}.`
  }
  return `${lead}${body}${locator ? ` ${locator}.` : ''}`
}

/** Sort references by first author's surname, then year. */
export function sortReferences(references: CitationReference[]): CitationReference[] {
  return [...references].sort((a, b) => {
    const aLast = lastNameOf(a.authors[0] ?? '').toLowerCase()
    const bLast = lastNameOf(b.authors[0] ?? '').toLowerCase()
    if (aLast !== bLast) return aLast.localeCompare(bLast)
    return a.year - b.year
  })
}

/** References in bibliography order: IEEE lists cited sources by first citation; the others are alphabetical. */
export function orderForBibliography(references: CitationReference[], style: CitationStyle): CitationReference[] {
  if (style !== 'ieee') return sortReferences(references)
  const cited = references.filter((r) => r.cited != null).sort((a, b) => (a.cited ?? 0) - (b.cited ?? 0))
  return [...cited, ...sortReferences(references.filter((r) => r.cited == null))]
}

/** A short unique key for a new reference, like "smith2021deep". */
export function generateCitationKey(ref: Pick<CitationReference, 'authors' | 'year' | 'title'>): string {
  const surname = lastNameOf(ref.authors[0] ?? '').toLowerCase().replace(/[^a-z]/g, '') || 'anon'
  const word = ref.title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'work'
  return `${surname}${ref.year}${word}`
}

/** How IEEE citation numbers change when a reference is removed: old number -> new number (null = removed). */
export type CitationNumberMap = Map<number, number | null>

/**
 * Remove a reference and close the gap in the IEEE citation order. Returns the
 * remaining references with compacted `cited` numbers and the mapping the text's
 * [n] markers need (the removed source maps to null).
 */
export function removeReferenceAndRenumber(
  references: CitationReference[],
  removedId: string
): { references: CitationReference[]; mapping: CitationNumberMap } {
  const mapping: CitationNumberMap = new Map()
  const removed = references.find((ref) => ref.id === removedId)
  if (removed?.cited != null) mapping.set(removed.cited, null)

  const remaining = references.filter((ref) => ref.id !== removedId)
  const order = remaining
    .filter((ref) => ref.cited != null)
    .sort((a, b) => (a.cited ?? 0) - (b.cited ?? 0))
  const next = new Map<string, number>()
  order.forEach((ref, index) => {
    next.set(ref.id, index + 1)
    if (ref.cited != null && ref.cited !== index + 1) mapping.set(ref.cited, index + 1)
  })

  return {
    references: remaining.map((ref) => (next.has(ref.id) ? { ...ref, cited: next.get(ref.id) } : ref)),
    mapping,
  }
}
