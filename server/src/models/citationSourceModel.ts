import { getRedisClient } from '../utils/redisClient'

/** The parts of a Crossref work record that the lookup reads. */
export interface CrossrefWork {
  type?: string
  title?: string[]
  author?: Array<{ given?: string; family?: string; name?: string }>
  issued?: { 'date-parts'?: number[][] }
  published?: { 'date-parts'?: number[][] }
  'container-title'?: string[]
  volume?: string
  issue?: string
  page?: string
  DOI?: string
  URL?: string
  publisher?: string
}

const CROSSREF_URL = 'https://api.crossref.org/works'
const REQUEST_TIMEOUT_MS = 8000
/** Keyword searches are slower than DOI lookups (Crossref often takes 3-13 s). */
const SEARCH_TIMEOUT_MS = 15000

/** Read JSON from Crossref, returning null when the work does not exist. */
async function readCrossref(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'IntelliDocs/1.0 (citation lookup)' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Crossref lookup failed: ${response.status}`)
  return response.json()
}

/** Fetch one work by DOI, or null when Crossref does not know it. */
export async function fetchWorkByDoi(doi: string): Promise<CrossrefWork | null> {
  const payload = (await readCrossref(`${CROSSREF_URL}/${encodeURIComponent(doi)}`)) as { message?: CrossrefWork } | null
  return payload?.message ?? null
}

/** Find the best-matching work for words from a title, or null when nothing matches. */
export async function searchWorkByTitle(title: string): Promise<CrossrefWork | null> {
  const payload = (await readCrossref(
    `${CROSSREF_URL}?query.bibliographic=${encodeURIComponent(title)}&rows=1`
  )) as { message?: { items?: CrossrefWork[] } } | null
  return payload?.message?.items?.[0] ?? null
}

/** The parts of a Semantic Scholar paper record that literature search reads. */
export interface SemanticScholarPaper {
  paperId?: string
  title?: string
  authors?: Array<{ name?: string }>
  year?: number | null
  venue?: string | null
  journal?: { name?: string; volume?: string; pages?: string } | null
  publicationTypes?: string[] | null
  citationCount?: number | null
  abstract?: string | null
  externalIds?: { DOI?: string; ArXiv?: string } | null
  url?: string | null
}

/** A search hit from one source, with the abstract Crossref sometimes carries. */
export interface CrossrefSearchWork extends CrossrefWork {
  abstract?: string
  'is-referenced-by-count'?: number
}

const SEMANTIC_SCHOLAR_URL = 'https://api.semanticscholar.org/graph/v1/paper/search'
const SEMANTIC_SCHOLAR_FIELDS = 'title,authors,year,citationCount,abstract,venue,externalIds,journal,publicationTypes,url'
/** Only the fields a reference needs, so a search returns a small payload. */
const CROSSREF_SEARCH_FIELDS = 'DOI,title,author,type,issued,published,container-title,volume,issue,page,URL,publisher,abstract,is-referenced-by-count'
const SEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60

/** Normalise a query so the same search hits the same cache entry. */
function searchCacheKey(source: string, query: string, rows: number): string {
  return `citations:search:${source}:${rows}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/** Read a cached search, or null when the cache is empty or unreachable. */
async function readSearchCache<T>(key: string): Promise<T[] | null> {
  try {
    const client = await getRedisClient()
    const cached = await client.get(key)
    if (!cached) return null
    const parsed: unknown = JSON.parse(cached)
    return Array.isArray(parsed) ? (parsed as T[]) : null
  } catch {
    return null
  }
}

/** Store a search for a day; a cache failure never fails the search. */
async function writeSearchCache(key: string, items: unknown[]): Promise<void> {
  try {
    const client = await getRedisClient()
    await client.set(key, JSON.stringify(items), { EX: SEARCH_CACHE_TTL_SECONDS })
  } catch {
    // The search result is still returned uncached.
  }
}

/** Search Crossref for up to `rows` works matching the words; [] when the service fails. */
export async function searchWorks(query: string, rows: number): Promise<CrossrefSearchWork[]> {
  const key = searchCacheKey('crossref', query, rows)
  const cached = await readSearchCache<CrossrefSearchWork>(key)
  if (cached) return cached
  try {
    const mailto = process.env.CROSSREF_MAILTO?.trim()
    const url = `${CROSSREF_URL}?query.bibliographic=${encodeURIComponent(query)}&rows=${rows}&select=${CROSSREF_SEARCH_FIELDS}${mailto ? `&mailto=${encodeURIComponent(mailto)}` : ''}`
    const payload = (await readCrossref(url, SEARCH_TIMEOUT_MS)) as { message?: { items?: CrossrefSearchWork[] } } | null
    const items = payload?.message?.items ?? []
    await writeSearchCache(key, items)
    return items
  } catch {
    return []
  }
}

/** Search Semantic Scholar for up to `limit` papers; [] when the service fails or rate-limits. */
export async function searchSemanticScholar(query: string, limit: number): Promise<SemanticScholarPaper[]> {
  const key = searchCacheKey('s2', query, limit)
  const cached = await readSearchCache<SemanticScholarPaper>(key)
  if (cached) return cached
  try {
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
    const response = await fetch(
      `${SEMANTIC_SCHOLAR_URL}?query=${encodeURIComponent(query)}&limit=${limit}&fields=${SEMANTIC_SCHOLAR_FIELDS}`,
      {
        headers: { 'User-Agent': 'IntelliDocs/1.0 (literature search)', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      }
    )
    if (!response.ok) return []
    const payload = (await response.json()) as { data?: SemanticScholarPaper[] }
    const items = payload.data ?? []
    await writeSearchCache(key, items)
    return items
  } catch {
    return []
  }
}
