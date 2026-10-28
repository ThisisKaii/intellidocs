/** How many consecutive words must match for a run of text to count as shared (7 avoids common phrases). */
export const SHINGLE_SIZE = 7

/** Share of a paragraph's word runs that must appear in a source before the paragraph is reported. */
const MIN_CONTAINMENT = 0.3

/** Containment at or above this is reported as a verbatim copy. */
const VERBATIM_CONTAINMENT = 0.8

/** Paragraphs shorter than this many words are too short to compare reliably. */
const MIN_PARAGRAPH_WORDS = SHINGLE_SIZE + 3

export type SourceKind = 'wikipedia' | 'arxiv' | 'openalex' | 'web'

/** A published text the document is compared against. */
export interface ComparisonSource {
  url: string
  title: string
  kind: SourceKind
  text: string
}

/** A paragraph of the document that shares text with a source. */
export interface SharedPassage {
  paragraph_index: number
  text: string
  /** Share of the paragraph found in the source, 0-100. */
  similarity: number
  match_type: 'verbatim' | 'partial'
  source_url: string
  source_title: string
  source_kind: SourceKind
  /** The matching stretch of the source, as written there. */
  source_excerpt: string
}

interface Token {
  word: string
  start: number
  end: number
}

/** Lower-case words with their position in the original text. */
function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    word: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
}

/** Every run of SHINGLE_SIZE consecutive words, as strings. */
function shinglesOf(tokens: Token[]): string[] {
  const runs: string[] = []
  for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i += 1) {
    runs.push(tokens.slice(i, i + SHINGLE_SIZE).map((token) => token.word).join(' '))
  }
  return runs
}

/** A source indexed by its word runs, remembering where each run first occurs. */
interface IndexedSource {
  source: ComparisonSource
  tokens: Token[]
  firstAt: Map<string, number>
}

/** Index a source so any word run can be looked up at once. */
function indexSource(source: ComparisonSource): IndexedSource {
  const tokens = tokenize(source.text)
  const firstAt = new Map<string, number>()
  shinglesOf(tokens).forEach((run, position) => {
    if (!firstAt.has(run)) firstAt.set(run, position)
  })
  return { source, tokens, firstAt }
}

/** The stretch of the source around a word position, in its original spelling. */
function excerptAround(indexed: IndexedSource, position: number): string {
  const first = indexed.tokens[Math.max(0, position - 6)]
  const last = indexed.tokens[Math.min(indexed.tokens.length - 1, position + SHINGLE_SIZE + 30)]
  return indexed.source.text.slice(first.start, last.end)
}

/**
 * Compare each paragraph with each source by shared runs of consecutive words. A paragraph is
 * reported with the source that shares the most of it. The overlap percentage weighs each reported
 * paragraph by how much of it was shared.
 */
export function comparePassages(
  paragraphs: string[],
  sources: ComparisonSource[]
): { overlap_percent: number; passages: SharedPassage[]; matchedUrls: string[] } {
  const indexed = sources.map(indexSource)
  const passages: SharedPassage[] = []
  let totalChars = 0
  let sharedChars = 0

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const tokens = tokenize(paragraph)
    if (tokens.length < MIN_PARAGRAPH_WORDS) return
    const runs = shinglesOf(tokens)
    totalChars += paragraph.length

    let best: { source: IndexedSource; hits: number; firstRun: string } | null = null
    for (const candidate of indexed) {
      let hits = 0
      let firstRun = ''
      for (const run of runs) {
        if (candidate.firstAt.has(run)) {
          hits += 1
          if (!firstRun) firstRun = run
        }
      }
      if (hits > 0 && (!best || hits > best.hits)) best = { source: candidate, hits, firstRun }
    }
    if (!best) return

    const containment = best.hits / runs.length
    if (containment < MIN_CONTAINMENT) return

    sharedChars += paragraph.length * containment
    passages.push({
      paragraph_index: paragraphIndex,
      text: paragraph,
      similarity: Math.round(containment * 1000) / 10,
      match_type: containment >= VERBATIM_CONTAINMENT ? 'verbatim' : 'partial',
      source_url: best.source.source.url,
      source_title: best.source.source.title,
      source_kind: best.source.source.kind,
      source_excerpt: excerptAround(best.source, best.source.firstAt.get(best.firstRun) ?? 0),
    })
  })

  const overlap = totalChars === 0 ? 0 : Math.min(100, Math.round((sharedChars / totalChars) * 1000) / 10)
  return { overlap_percent: overlap, passages, matchedUrls: Array.from(new Set(passages.map((p) => p.source_url))) }
}
