import { getSearchProviders, type SearchProvider, type SourceCandidate } from '../models/webSourceModel'
import { comparePassages, type SharedPassage, type SourceKind } from '../utils/shingleMatch'
import { documentParagraphs, pickQueryPhrases } from '../utils/webText'

/** Passages searched for per check: enough to cover a long document, few enough to stay inside free API limits. */
const MAX_QUERY_PHRASES = 8
/** Pages downloaded and compared per check. */
const MAX_SOURCES = 12
/** A source with less text than this cannot be compared meaningfully. */
const MIN_SOURCE_CHARS = 200
/** A document with fewer words than this is too short to search for. */
const MIN_DOCUMENT_WORDS = 30
/** Whole-check time budget; later steps are skipped once it is spent. Default 85s stays safely under Render 100s proxy timeout. */
const TIME_BUDGET_MS = Number(process.env.WEB_CHECK_TIME_BUDGET_MS) || 85000
/** Requests in flight at once, kept low for the free tiers of the services used. */
const CONCURRENCY = 6

/** What happened with one place that was searched. */
export interface ProviderReport {
  name: string
  kind: SourceKind
  status: 'searched' | 'not_configured' | 'failed'
  message?: string
}

/** One text the document was compared against. */
export interface SourceReport {
  url: string
  title: string
  kind: SourceKind
  /** True when the document shares text with it. */
  matched: boolean
}

/** Result of the online originality check. */
export interface WebOriginalityResult {
  overlap_percent: number
  passages: SharedPassage[]
  providers: ProviderReport[]
  sources: SourceReport[]
  /** How many passages of the document were searched for. */
  queries: number
  /** True when the time budget ran out before every step finished. */
  truncated: boolean
  /** A plain-language remark when the check could not run properly. */
  note?: string
}

interface CheckInput {
  documentHtml: string
  providers?: SearchProvider[]
  /** Replaceable clock, for tests. */
  now?: () => number
  timeBudgetMs?: number
}

/** Run an async function over items with at most `limit` running at once, keeping the order. */
async function inPool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

/** The result for a check that could not search at all. */
function emptyResult(providers: ProviderReport[], note: string): WebOriginalityResult {
  return { overlap_percent: 0, passages: [], providers, sources: [], queries: 0, truncated: false, note }
}

/**
 * Search the web and scholarly sources for passages of a document and compare what is found with
 * the document. Exact-phrase searches on a few sentences spread through the document find the pages
 * that could have been copied from; those pages are downloaded and compared run by run of words.
 * Nothing is stored.
 */
export async function runWebOriginalityCheck(input: CheckInput): Promise<WebOriginalityResult> {
  const now = input.now ?? Date.now
  const deadline = now() + (input.timeBudgetMs ?? TIME_BUDGET_MS)
  const providers = input.providers ?? getSearchProviders()
  const reports: ProviderReport[] = providers.map((provider) => ({
    name: provider.name,
    kind: provider.kind,
    status: provider.isConfigured() ? 'searched' : 'not_configured',
  }))
  const active = providers.filter((provider) => provider.isConfigured())

  const paragraphs = documentParagraphs(input.documentHtml)
  const wordCount = paragraphs.join(' ').split(/\s+/).filter(Boolean).length
  if (wordCount < MIN_DOCUMENT_WORDS) {
    return emptyResult(reports, 'The document is too short to check online. Write a few more sentences first.')
  }
  const phrases = pickQueryPhrases(paragraphs, MAX_QUERY_PHRASES)
  if (phrases.length === 0) {
    return emptyResult(reports, 'The document has no long sentences to search for yet.')
  }

  // Search every provider for every phrase; count how many phrases point at each page.
  const found = new Map<string, { candidate: SourceCandidate; provider: SearchProvider; hits: number }>()
  let truncated = false
  await Promise.all(
    active.map(async (provider) => {
      const report = reports.find((entry) => entry.name === provider.name)
      let failures = 0
      let lastError = ''
      for (const phrase of phrases) {
        if (now() > deadline) {
          truncated = true
          break
        }
        try {
          for (const candidate of await provider.search(phrase)) {
            const entry = found.get(candidate.url)
            if (entry) entry.hits += 1
            else found.set(candidate.url, { candidate, provider, hits: 1 })
          }
        } catch (error) {
          failures += 1
          lastError = error instanceof Error ? error.message : 'request failed'
        }
      }
      if (report && failures > 0) {
        report.status = failures === phrases.length ? 'failed' : 'searched'
        report.message = failures === phrases.length ? lastError : `${failures} of ${phrases.length} searches failed`
      }
    })
  )

  // Keep the pages found most often, and download the text of those that came without any.
  const top = Array.from(found.values()).sort((a, b) => b.hits - a.hits).slice(0, MAX_SOURCES)
  const loaded = await inPool(top, CONCURRENCY, async ({ candidate, provider }) => {
    if (candidate.text) return candidate.text
    if (!provider.loadText || now() > deadline) {
      if (now() > deadline) truncated = true
      return null
    }
    try {
      return await provider.loadText(candidate)
    } catch {
      return null
    }
  })

  const sources = top.flatMap(({ candidate }, index) => {
    const text = loaded[index]
    return text && text.length >= MIN_SOURCE_CHARS ? [{ url: candidate.url, title: candidate.title, kind: candidate.kind, text }] : []
  })

  const comparison = comparePassages(paragraphs, sources)
  const matched = new Set(comparison.matchedUrls)
  const noneSearched = reports.every((report) => report.status !== 'searched')
  return {
    overlap_percent: comparison.overlap_percent,
    passages: comparison.passages,
    providers: reports,
    sources: sources.map((source) => ({ url: source.url, title: source.title, kind: source.kind, matched: matched.has(source.url) })),
    queries: phrases.length,
    truncated,
    note: noneSearched ? 'None of the search services could be reached. Try again in a minute.' : undefined,
  }
}
