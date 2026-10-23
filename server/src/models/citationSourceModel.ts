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

/** Read JSON from Crossref, returning null when the work does not exist. */
async function readCrossref(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'IntelliDocs/1.0 (citation lookup)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
