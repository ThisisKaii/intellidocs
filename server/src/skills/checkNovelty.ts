export interface NoveltyOptions {
  /** Highest share of the output's content words that may be absent from the source; omit to skip the check. */
  maxNewWordRatio?: number
}

/** Connectives and academic glue that rephrasing legitimately adds. */
const GLUE = new Set(
  'furthermore moreover however consequently therefore thus hence additionally addition contrast similarly finally first second third firstly secondly specifically particularly notably overall study research paper section approach present presents presented proposed propose proposes aims aim address addresses addressed context result results regard respect order well also then because since although while whereas which these this those such each both other further following include includes including given based used using uses make makes ensure ensures enable enables allow allows within through toward towards between among across thereby namely accordingly subsequently ultimately meanwhile indeed nevertheless nonetheless instance example particular regarding respectively aforementioned latter former current currently their there they them that what when where with from into onto upon have been being were will would could should might must does done shall about after before during under over more most less least very much many several various'.split(' ')
)

const NUMBER = /\d+(?:[.,]\d+)*%?/g
const BRACKET_CITATION = /\[\d+(?:\s*[,–-]\s*\d+)*\]/g
const AUTHOR_YEAR = /\([A-Z][A-Za-z'-]+(?:\s+(?:et al\.|&|and)\s*[A-Z]?[A-Za-z'-]*)?,?\s+\d{4}[a-z]?\)/g

function stem(word: string): string {
  return word.toLowerCase().slice(0, 5)
}

/** Capitalised words that do not open a sentence: names, places, products, acronyms. */
function properNouns(text: string): string[] {
  const found: string[] = []
  const pattern = /[A-Z][A-Za-z0-9'-]*/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index).trimEnd()
    const opensSentence = before.length === 0 || /[.!?:;"“(\n]$/.test(before)
    if (opensSentence || match[0] === 'I') continue
    found.push(match[0])
  }
  return found
}

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((word) => !GLUE.has(word))
}

/**
 * Check that a rewrite adds nothing the user did not write: no new numbers,
 * citations or names, and (optionally) little new vocabulary. Returns one
 * plain-language violation per problem; empty means the text is grounded.
 */
export function checkNovelty(output: string, source: string, options: NoveltyOptions = {}): string[] {
  const violations: string[] = []
  const sourceLower = source.toLowerCase()
  const sourceCompact = source.replace(/\s+/g, '')

  for (const number of new Set(output.match(NUMBER) ?? [])) {
    if (!source.includes(number)) violations.push(`adds the number "${number}"`)
  }
  for (const citation of new Set([...(output.match(BRACKET_CITATION) ?? []), ...(output.match(AUTHOR_YEAR) ?? [])])) {
    if (!sourceCompact.includes(citation.replace(/\s+/g, ''))) violations.push(`adds the citation "${citation}"`)
  }
  for (const noun of new Set(properNouns(output))) {
    if (GLUE.has(noun.toLowerCase())) continue
    if (!new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(sourceLower)) {
      violations.push(`adds the name "${noun}"`)
    }
  }

  if (options.maxNewWordRatio !== undefined) {
    const sourceStems = new Set(contentWords(source).map(stem))
    const words = contentWords(output)
    const added = words.filter((word) => !sourceStems.has(stem(word)))
    if (words.length > 0 && added.length / words.length > options.maxNewWordRatio) {
      violations.push(`adds new material (${[...new Set(added)].slice(0, 6).join(', ')})`)
    }
  }
  return violations
}
