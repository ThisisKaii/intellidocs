import { fetchWorkByDoi, searchWorkByTitle, type CrossrefWork } from '../models/citationSourceModel'
import type { CitationLookupResult } from '../types/index'

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"<>]+/i

/** Pull a DOI out of a bare DOI, a doi.org link or text that contains one. */
export function extractDoi(query: string): string | null {
  const match = DOI_PATTERN.exec(query.trim())
  return match ? match[0].replace(/[.,;)]+$/, '') : null
}

/** Map Crossref's work type to the reference types the editor offers. */
function mapType(type: string | undefined): CitationLookupResult['type'] {
  switch (type) {
    case 'journal-article':
      return 'journal'
    case 'book':
    case 'monograph':
    case 'edited-book':
    case 'book-chapter':
      return 'book'
    case 'proceedings-article':
      return 'conference'
    case 'report':
      return 'report'
    case 'dissertation':
      return 'thesis'
    default:
      return 'other'
  }
}

/** Convert a Crossref work into a reference with one "Given Family" name per author. */
function toReference(work: CrossrefWork): CitationLookupResult | null {
  const title = work.title?.[0]?.trim()
  if (!title) return null
  const year = work.issued?.['date-parts']?.[0]?.[0] ?? work.published?.['date-parts']?.[0]?.[0] ?? new Date().getFullYear()
  const authors = (work.author ?? [])
    .map((author) => author.name ?? [author.given, author.family].filter(Boolean).join(' '))
    .filter((name) => name.trim().length > 0)
  return {
    type: mapType(work.type),
    authors,
    title,
    year,
    venue: work['container-title']?.[0],
    volume: work.volume,
    issue: work.issue,
    pages: work.page,
    doi: work.DOI,
    url: work.URL,
    publisher: work.publisher,
  }
}

/** Look up a reference from a DOI, a doi.org link or words from its title; null when nothing is found. */
export async function lookupCitation(query: string): Promise<CitationLookupResult | null> {
  const doi = extractDoi(query)
  const work = doi ? await fetchWorkByDoi(doi) : await searchWorkByTitle(query)
  return work ? toReference(work) : null
}
