import type { SourceKind } from '../utils/shingleMatch'
import { fetchPublicPage } from '../utils/safeFetch'
import { pageText } from '../utils/webText'

/** A published text that may contain the phrase searched for. */
export interface SourceCandidate {
  url: string
  title: string
  kind: SourceKind
  /** The text when the search already returned it (abstracts); loaded later otherwise. */
  text?: string
}

/** One place the document can be searched for copied text. */
export interface SearchProvider {
  /** Name shown to the person, e.g. "Wikipedia". */
  name: string
  kind: SourceKind
  /** False when the key it needs is not set; it is then skipped and reported as such. */
  isConfigured: () => boolean
  /** Find sources containing the exact phrase. */
  search: (phrase: string) => Promise<SourceCandidate[]>
  /** Download the full text of a candidate that came without any. */
  loadText?: (candidate: SourceCandidate) => Promise<string | null>
}

/** How long one search request may take. */
const REQUEST_TIMEOUT_MS = 8000

/** Who is asking, as Wikimedia and arXiv require: the app name and a way to reach its operator. */
function userAgent(env: NodeJS.ProcessEnv): string {
  return `IntelliDocs-Originality/1.0 (${env.WEB_CHECK_CONTACT || 'https://github.com/ThisisKaii/intellidocs'})`
}

/** GET a URL and return its body as text, failing with a short message on any error status. */
async function getText(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`)
  return response.text()
}

/** Wrap a phrase in quotes so providers search for the exact words in order. */
function exact(phrase: string): string {
  return `"${phrase.replace(/"/g, '')}"`
}

// ── Wikipedia ────────────────────────────────────────────────────────────────

/** The article titles in a Wikipedia search answer. */
export function parseWikipediaSearch(json: unknown): string[] {
  const results = (json as { query?: { search?: { title?: string }[] } })?.query?.search ?? []
  return results.map((entry) => entry.title ?? '').filter(Boolean)
}

/** The plain text of the first page in a Wikipedia extracts answer. */
export function parseWikipediaExtract(json: unknown): string | null {
  const pages = (json as { query?: { pages?: Record<string, { extract?: string }> } })?.query?.pages ?? {}
  const first = Object.values(pages)[0]
  return first?.extract ?? null
}

/** Wikipedia article link for a title. */
function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

/** Wikipedia: free, no key. Articles are downloaded in full for comparison. */
function wikipediaProvider(env: NodeJS.ProcessEnv): SearchProvider {
  const headers = { 'User-Agent': userAgent(env), Accept: 'application/json' }
  return {
    name: 'Wikipedia',
    kind: 'wikipedia',
    isConfigured: () => true,
    async search(phrase) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(exact(phrase))}&srlimit=3&srprop=&format=json`
      return parseWikipediaSearch(JSON.parse(await getText(url, headers))).map((title) => ({
        url: wikipediaUrl(title),
        title,
        kind: 'wikipedia' as const,
      }))
    },
    async loadText(candidate) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(candidate.title)}&format=json`
      return parseWikipediaExtract(JSON.parse(await getText(url, headers)))
    },
  }
}

// ── arXiv ────────────────────────────────────────────────────────────────────

/** Decode the entities arXiv uses in its Atom feed. */
function decodeXml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** The papers (link, title, abstract) in an arXiv Atom feed. */
export function parseArxivFeed(xml: string): SourceCandidate[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  return entries.flatMap((entry) => {
    const id = entry.match(/<id>([^<]+)<\/id>/)?.[1]?.trim()
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
    if (!id || !summary) return []
    return [{
      url: id,
      title: decodeXml((title ?? id).replace(/\s+/g, ' ').trim()),
      kind: 'arxiv' as const,
      text: decodeXml(summary.replace(/\s+/g, ' ').trim()),
    }]
  })
}

/** arXiv: free, no key. Only abstracts are compared, so this catches copied abstracts and summaries. */
function arxivProvider(env: NodeJS.ProcessEnv): SearchProvider {
  const headers = { 'User-Agent': userAgent(env) }
  return {
    name: 'arXiv',
    kind: 'arxiv',
    isConfigured: () => true,
    async search(phrase) {
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${exact(phrase)}`)}&max_results=3`
      return parseArxivFeed(await getText(url, headers))
    },
  }
}

// ── OpenAlex ─────────────────────────────────────────────────────────────────

/** Rebuild an abstract from OpenAlex's word-to-positions index. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word
  }
  return words.filter(Boolean).join(' ')
}

/** The works (link, title, abstract) in an OpenAlex answer. */
export function parseOpenAlexWorks(json: unknown): SourceCandidate[] {
  const results = (json as { results?: { id?: string; doi?: string | null; title?: string | null; abstract_inverted_index?: Record<string, number[]> | null }[] })?.results ?? []
  return results.flatMap((work) => {
    const text = abstractFromInvertedIndex(work.abstract_inverted_index)
    const url = work.doi || work.id
    if (!text || !url) return []
    return [{ url, title: work.title ?? url, kind: 'openalex' as const, text }]
  })
}

/** OpenAlex: scholarly works. Free without key via polite pool; optional key for higher limits. */
function openAlexProvider(env: NodeJS.ProcessEnv): SearchProvider {
  const headers = { 'User-Agent': userAgent(env), Accept: 'application/json' }
  return {
    name: 'OpenAlex',
    kind: 'openalex',
    isConfigured: () => true,
    async search(phrase) {
      const apiKeyParam = env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}` : ''
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(exact(phrase))}&per_page=3&select=id,doi,title,abstract_inverted_index${apiKeyParam}`
      return parseOpenAlexWorks(JSON.parse(await getText(url, headers)))
    },
  }
}

// ── Web search (DuckDuckGo & Brave) ──────────────────────────────────────────

/** Parse result links and titles from DuckDuckGo HTML search. */
export function parseDuckDuckGoResults(html: string): SourceCandidate[] {
  const results: SourceCandidate[] = []
  const re = /<h2 class="result__title">[\s\S]*?<a[^>]*href="[^"]*uddg=([^&"']+)[\s\S]*?>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const url = decodeURIComponent(m[1])
      const title = m[2].replace(/<[^>]+>/g, '').trim()
      if (url.startsWith('http') && !results.some((r) => r.url === url)) {
        results.push({ url, title: title || url, kind: 'web' })
      }
    } catch {
      // skip malformed url
    }
  }
  return results
}

/** Free keyless DuckDuckGo web search: extracts links and crawls pages directly. */
function duckDuckGoProvider(env: NodeJS.ProcessEnv): SearchProvider {
  return {
    name: 'Web (DuckDuckGo)',
    kind: 'web',
    isConfigured: () => true,
    async search(phrase) {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(exact(phrase))}`
      const html = await getText(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      })
      return parseDuckDuckGoResults(html).slice(0, 5)
    },
    async loadText(candidate) {
      const html = await fetchPublicPage(candidate.url, { userAgent: userAgent(env) })
      return html ? pageText(html) : null
    },
  }
}

/** The pages (link, title) in a Brave web search answer. */
export function parseBraveResults(json: unknown): SourceCandidate[] {
  const results = (json as { web?: { results?: { url?: string; title?: string }[] } })?.web?.results ?? []
  return results.flatMap((result) =>
    result.url ? [{ url: result.url, title: result.title ?? result.url, kind: 'web' as const }] : []
  )
}

/** Brave Search: the general web; needs BRAVE_SEARCH_API_KEY. Result pages are downloaded for comparison. */
function braveProvider(env: NodeJS.ProcessEnv): SearchProvider {
  return {
    name: 'Web (Brave Search)',
    kind: 'web',
    isConfigured: () => Boolean(env.BRAVE_SEARCH_API_KEY),
    async search(phrase) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(exact(phrase))}&count=5`
      const body = await getText(url, { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY ?? '' })
      return parseBraveResults(JSON.parse(body))
    },
    async loadText(candidate) {
      const html = await fetchPublicPage(candidate.url, { userAgent: userAgent(env) })
      return html ? pageText(html) : null
    },
  }
}

/** Every place the online check can search, in the order they are tried. */
export function getSearchProviders(env: NodeJS.ProcessEnv = process.env): SearchProvider[] {
  const webProvider = env.BRAVE_SEARCH_API_KEY ? braveProvider(env) : duckDuckGoProvider(env)
  return [wikipediaProvider(env), arxivProvider(env), openAlexProvider(env), webProvider]
}
