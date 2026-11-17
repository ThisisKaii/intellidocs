import {
  searchSemanticScholar,
  searchWorks,
  type CrossrefSearchWork,
  type SemanticScholarPaper,
} from '../models/citationSourceModel'
import type { CitationLookupResult } from '../types/index'
import { toReference } from './lookupCitation'

/** A real paper returned by a scholarly index, never written by the model. */
export interface GroundedPaper extends CitationLookupResult {
  source: 'crossref' | 'semanticscholar'
  abstract?: string
  citationCount?: number
}

export interface GroundLiteratureInput {
  query: string
  claimText?: string
  limit?: number
}

const STOPWORDS = new Set(
  'a an and are as at be been by can could do does for from has have how in into is it its may might more most of on or our over such than that the their them then there these this those to was we were what when which while who will with would about also find paper papers citation citations source sources supporting support recent cite add some please me my'.split(' ')
)
const ABSTRACT_MAX = 400

/** Lower-case content words: what a search engine should match on. */
export function keywordsOf(text: string): string[] {
  const seen = new Set<string>()
  for (const word of text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []) {
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue
    seen.add(word)
  }
  return [...seen]
}

/** Strip JATS tags Crossref puts in abstracts and cap the length. */
function cleanAbstract(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plain) return undefined
  return plain.length > ABSTRACT_MAX ? `${plain.slice(0, ABSTRACT_MAX - 1).trimEnd()}…` : plain
}

function fromCrossref(work: CrossrefSearchWork): GroundedPaper | null {
  const reference = toReference(work)
  if (!reference || reference.authors.length === 0) return null
  return {
    ...reference,
    source: 'crossref',
    abstract: cleanAbstract(work.abstract),
    citationCount: work['is-referenced-by-count'],
  }
}

function semanticType(types: string[] | null | undefined): CitationLookupResult['type'] {
  if (types?.includes('JournalArticle')) return 'journal'
  if (types?.includes('Conference')) return 'conference'
  if (types?.includes('Book') || types?.includes('BookSection')) return 'book'
  return 'other'
}

function fromSemanticScholar(paper: SemanticScholarPaper): GroundedPaper | null {
  const title = paper.title?.trim()
  const authors = (paper.authors ?? []).map((author) => author.name?.trim() ?? '').filter(Boolean)
  if (!title || authors.length === 0 || !paper.year) return null
  const doi = paper.externalIds?.DOI
  return {
    type: semanticType(paper.publicationTypes),
    authors,
    title,
    year: paper.year,
    venue: paper.journal?.name || paper.venue || undefined,
    volume: paper.journal?.volume,
    pages: paper.journal?.pages?.trim() || undefined,
    doi,
    url: doi ? `https://doi.org/${doi}` : (paper.url ?? undefined),
    source: 'semanticscholar',
    abstract: cleanAbstract(paper.abstract),
    citationCount: paper.citationCount ?? undefined,
  }
}

function normalizedTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Share of the query's keywords that the paper's title and abstract contain. */
function relevance(paper: GroundedPaper, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const haystack = `${paper.title} ${paper.abstract ?? ''}`.toLowerCase()
  return keywords.filter((word) => haystack.includes(word)).length / keywords.length
}

/**
 * Find real papers for a claim or topic in Crossref and Semantic Scholar.
 * Every result comes straight from an index; nothing is generated. Duplicates
 * across the two indexes are merged (Semantic Scholar's abstract fills a gap
 * in Crossref's record), then ranked by keyword overlap and citation count.
 */
export async function groundLiteratureCitations(input: GroundLiteratureInput): Promise<GroundedPaper[]> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 5)
  const keywords = keywordsOf(`${input.query} ${input.claimText ?? ''}`).slice(0, 10)
  if (keywords.length === 0) return []
  const searchText = keywords.join(' ')
  const fetchRows = Math.max(limit * 2, 6)

  const [crossref, semantic] = await Promise.all([
    searchWorks(searchText, fetchRows),
    searchSemanticScholar(searchText, fetchRows),
  ])

  const merged: GroundedPaper[] = []
  const add = (paper: GroundedPaper | null): void => {
    if (!paper) return
    const doi = paper.doi?.toLowerCase()
    const title = normalizedTitle(paper.title)
    const existing = merged.find((other) => (doi && other.doi?.toLowerCase() === doi) || normalizedTitle(other.title) === title)
    if (existing) {
      existing.abstract ??= paper.abstract
      existing.citationCount = Math.max(existing.citationCount ?? 0, paper.citationCount ?? 0) || existing.citationCount
      existing.doi ??= paper.doi
      return
    }
    merged.push(paper)
  }
  crossref.forEach((work) => add(fromCrossref(work)))
  semantic.forEach((paper) => add(fromSemanticScholar(paper)))

  return merged
    .map((paper) => ({ paper, score: relevance(paper, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.paper.citationCount ?? 0) - (a.paper.citationCount ?? 0))
    .slice(0, limit)
    .map(({ paper }) => paper)
}
