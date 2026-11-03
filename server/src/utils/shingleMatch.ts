/** How many consecutive words must match for a run of text to count as shared (7 avoids common phrases). */
export const SHINGLE_SIZE = 7

/** Share of a paragraph's word runs that must appear in a source before the paragraph is reported. */
const MIN_CONTAINMENT = 0.3

/** Containment at or above this is reported as a verbatim copy. */
const VERBATIM_CONTAINMENT = 0.8

/** Paragraphs shorter than this many words are too short to compare reliably. */
const MIN_PARAGRAPH_WORDS = SHINGLE_SIZE + 3

/** Shared runs that get a paragraph reported however long it is: about 14 copied words in a row. */
const MIN_SHARED_RUNS = 8

/** A sentence needs this many content words before its wording can be compared reliably. */
const MIN_SENTENCE_STEMS = 6

/** Content words a sentence must share with one source sentence to count as reworded from it. */
const MIN_SHARED_STEMS = 5

/**
 * Dice overlap of content words required to call a sentence reworded. Dice is used instead of
 * containment because search returns on-topic texts that share vocabulary without being copied.
 */
const MIN_SENTENCE_DICE = 0.6

/** Function words, ignored when comparing what two sentences say. */
export const STOPWORDS = new Set(
  `a about above after again all also although am among an and any are as at be because been before being
  between both but by can could did do does doing during each either for from further had has have having he
  her here hers him his how however i if in into is it its itself may me might more most much must my neither
  no nor not of off on once only or other our ours out over own she should since so some such than that the
  their theirs them then there therefore these they this those through thus to too under until up upon very
  was we were what when where whereas whether which while who whom whose why will with within without would
  yet you your`.split(/\s+/)
)

/** Words writers commonly swap for one another; each group compares as its first word. */
const SYNONYM_GROUPS = [
  'use utilize utilise employ apply',
  'show demonstrate indicate reveal illustrate',
  'help aid assist support facilitate',
  'improve enhance boost strengthen',
  'increase raise grow rise',
  'decrease reduce lower lessen diminish',
  'big large major substantial significant considerable',
  'small minor slight',
  'important crucial critical essential vital key',
  'many numerous various multiple several',
  'method approach technique procedure strategy',
  'result outcome finding',
  'goal aim objective purpose',
  'problem issue challenge difficulty',
  'cause trigger induce',
  'effect impact influence',
  'need require necessitate demand',
  'get obtain acquire gain',
  'give provide offer supply',
  'make create produce generate',
  'build construct develop',
  'start begin commence initiate',
  'end finish conclude complete',
  'change alter modify adjust',
  'examine analyze analyse investigate explore study assess evaluate',
  'suggest propose recommend',
  'find discover identify detect',
  'include contain comprise encompass',
  'allow enable permit',
  'ensure guarantee',
  'main primary principal',
  'whole entire overall',
  'quick rapid fast swift',
  'hard difficult tough',
  'people individual person',
  'worker employee staff',
  'student learner pupil',
  'teacher instructor educator',
  'company firm organization organisation enterprise',
  'area region zone',
  'world global worldwide',
]

export type SourceKind = 'wikipedia' | 'arxiv' | 'openalex' | 'crossref' | 'semanticscholar' | 'web'

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
  match_type: 'verbatim' | 'partial' | 'paraphrased'
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

/** Reduce a word to a rough root so "changes", "changed" and "changing" compare equal. */
function stem(word: string): string {
  if (word.length <= 4) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  let root = word
  if (/(ing|ed)$/.test(root)) root = root.replace(/(ing|ed)$/, '')
  else if (/es$/.test(root)) root = root.slice(0, -2)
  else if (/[^sui]s$/.test(root)) root = root.slice(0, -1)
  if (root.length < 3) return word
  if (/([^aeiouls])\1$/.test(root)) root = root.slice(0, -1)
  return root.endsWith('e') ? root.slice(0, -1) : root
}

/** Root of each synonym, mapped to the root its group compares as. */
const SYNONYM_ROOT = new Map(
  SYNONYM_GROUPS.flatMap((group) => {
    const roots = group.split(' ').map(stem)
    return roots.map((root): [string, string] => [root, roots[0]])
  })
)

/** The distinct content words of a sentence, reduced to roots and with synonyms merged. */
function contentStems(sentence: string): Set<string> {
  const stems = new Set<string>()
  for (const { word } of tokenize(sentence)) {
    if (STOPWORDS.has(word) || /^\d+$/.test(word)) continue
    const root = stem(word)
    stems.add(SYNONYM_ROOT.get(root) ?? root)
  }
  return stems
}

/** Split text at sentence ends and line breaks. */
function sentencesOf(text: string): string[] {
  return Array.from(text.matchAll(/[^\n]+?(?:[.!?]+(?=\s|$)|$)/gm), (match) => match[0].trim())
}

/** A source sentence ready to compare by content words. */
interface SourceSentence {
  text: string
  stems: Set<string>
}

/** A source indexed by its word runs and by the content words of its sentences. */
interface IndexedSource {
  source: ComparisonSource
  tokens: Token[]
  firstAt: Map<string, number>
  sentences: SourceSentence[]
  /** Which sentences hold each content word, so only related sentences are compared. */
  sentencesWith: Map<string, number[]>
}

/** Index a source so any word run can be looked up at once. */
function indexSource(source: ComparisonSource): IndexedSource {
  const tokens = tokenize(source.text)
  const firstAt = new Map<string, number>()
  shinglesOf(tokens).forEach((run, position) => {
    if (!firstAt.has(run)) firstAt.set(run, position)
  })
  const sentences = sentencesOf(source.text).map((text) => ({ text, stems: contentStems(text) }))
  const sentencesWith = new Map<string, number[]>()
  sentences.forEach((sentence, position) => {
    for (const root of sentence.stems) {
      const holders = sentencesWith.get(root)
      if (holders) holders.push(position)
      else sentencesWith.set(root, [position])
    }
  })
  return { source, tokens, firstAt, sentences, sentencesWith }
}

/** The stretch of the source around a word position, in its original spelling. */
function excerptAround(indexed: IndexedSource, position: number): string {
  const first = indexed.tokens[Math.max(0, position - 6)]
  const last = indexed.tokens[Math.min(indexed.tokens.length - 1, position + SHINGLE_SIZE + 30)]
  return indexed.source.text.slice(first.start, last.end)
}

/** The source sentence closest in content to a sentence, when it is close enough to be reworded from it. */
function closestSentence(stems: Set<string>, indexed: IndexedSource): { sentence: SourceSentence; dice: number } | null {
  const shared = new Map<number, number>()
  for (const root of stems) {
    for (const position of indexed.sentencesWith.get(root) ?? []) {
      shared.set(position, (shared.get(position) ?? 0) + 1)
    }
  }
  let closest: { sentence: SourceSentence; dice: number } | null = null
  for (const [position, count] of shared) {
    if (count < MIN_SHARED_STEMS) continue
    const sentence = indexed.sentences[position]
    const dice = (2 * count) / (stems.size + sentence.stems.size)
    if (dice >= MIN_SENTENCE_DICE && (!closest || dice > closest.dice)) closest = { sentence, dice }
  }
  return closest
}

/** How much of a paragraph restates a source in other words, 0-1, and the closest stretch of the source. */
function rewordedShare(paragraph: string, indexed: IndexedSource): { share: number; excerpt: string } | null {
  const total = tokenize(paragraph).length
  let weighted = 0
  let strongest: { sentence: SourceSentence; dice: number } | null = null
  for (const text of sentencesOf(paragraph)) {
    const stems = contentStems(text)
    if (stems.size < MIN_SENTENCE_STEMS) continue
    const closest = closestSentence(stems, indexed)
    if (!closest) continue
    weighted += tokenize(text).length * closest.dice
    if (!strongest || closest.dice > strongest.dice) strongest = closest
  }
  if (!strongest) return null
  return { share: Math.min(1, weighted / total), excerpt: strongest.sentence.text }
}

/**
 * Compare each paragraph with each source by shared runs of consecutive words, then look for
 * sentences restated in other words in the paragraphs that did not match. A paragraph is reported
 * with the source that shares the most of it. The overlap percentage weighs each reported paragraph
 * by how much of it was shared.
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

    const containment = best ? best.hits / runs.length : 0
    if (best && (containment >= MIN_CONTAINMENT || best.hits >= MIN_SHARED_RUNS)) {
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
      return
    }

    let reworded: { source: IndexedSource; share: number; excerpt: string } | null = null
    for (const candidate of indexed) {
      const match = rewordedShare(paragraph, candidate)
      if (match && (!reworded || match.share > reworded.share)) reworded = { source: candidate, ...match }
    }
    if (!reworded) return

    sharedChars += paragraph.length * reworded.share
    passages.push({
      paragraph_index: paragraphIndex,
      text: paragraph,
      similarity: Math.round(reworded.share * 1000) / 10,
      match_type: 'paraphrased',
      source_url: reworded.source.source.url,
      source_title: reworded.source.source.title,
      source_kind: reworded.source.source.kind,
      source_excerpt: reworded.excerpt,
    })
  })

  const overlap = totalChars === 0 ? 0 : Math.min(100, Math.round((sharedChars / totalChars) * 1000) / 10)
  return { overlap_percent: overlap, passages, matchedUrls: Array.from(new Set(passages.map((p) => p.source_url))) }
}
