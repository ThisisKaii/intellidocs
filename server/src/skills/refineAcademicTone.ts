import { z } from 'zod'
import { aiClient, type ChatCompleter } from '../ai/aiClient'
import { parseModelJson } from '../ai/parseModelJson'
import { buildTonePrompt } from '../ai/prompts/systemPrompts'
import { checkNovelty } from './checkNovelty'

export type ToneFocus = 'clarity' | 'hedging' | 'vocabulary' | 'all'
export type ToneCategory = 'hedging' | 'cohesion' | 'conciseness' | 'vocabulary'

/** One suggested change: `original` occurs exactly once in the text, so the editor can find it. */
export interface ToneEdit {
  original: string
  refined: string
  reason: string
  ruleCategory: ToneCategory
}

export interface ToneNotice {
  category: 'acronym'
  term: string
  message: string
}

export interface ToneRefinement {
  edits: ToneEdit[]
  notices: ToneNotice[]
}

export interface RefineToneInput {
  text: string
  focus: ToneFocus
  /** Surrounding document text, to see whether an acronym was spelled out earlier. */
  contextText?: string
}

export const TONE_TEXT_MAX = 6000
const MAX_EDITS = 12

const FOCUS_CATEGORIES: Record<ToneFocus, ToneCategory[]> = {
  clarity: ['conciseness', 'cohesion'],
  hedging: ['hedging'],
  vocabulary: ['vocabulary'],
  all: ['hedging', 'cohesion', 'conciseness', 'vocabulary'],
}

/** Lower-case starters a connector may precede without changing a proper noun. */
const LOWERABLE = new Set(['the', 'this', 'these', 'that', 'those', 'it', 'its', 'we', 'they', 'our', 'their', 'there', 'a', 'an', 'in', 'on', 'for', 'each', 'all', 'some', 'many', 'most', 'such'])

interface Rule {
  pattern: RegExp
  category: ToneCategory
  reason: string
  /** Replacement for the whole match. */
  replace: (match: RegExpExecArray, atSentenceStart: boolean) => string
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function lowerStarter(word: string): string {
  return LOWERABLE.has(word.toLowerCase()) ? word.toLowerCase() : word
}

const CONTRACTIONS: Record<string, string> = {
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "it's": 'it is',
  "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not', "haven't": 'have not',
  "hasn't": 'has not', "let's": 'let us', "that's": 'that is', "there's": 'there is',
}

const RULES: Rule[] = [
  {
    pattern: /\b(?:it is (?:important|worth) (?:to note|noting|mentioning|to mention) that|it should be noted that|needless to say,?|basically,?|actually,?|literally,?)\s+([A-Za-z]+)/gi,
    category: 'conciseness',
    reason: 'Filler phrase; the sentence says the same without it.',
    replace: (match, start) => (start ? capitalize(match[1]) : match[1]),
  },
  {
    pattern: /\bin order to\b/gi,
    category: 'conciseness',
    reason: '“To” carries the same meaning more concisely.',
    replace: (match, start) => (start || match[0].startsWith('I') ? 'To' : 'to'),
  },
  {
    pattern: /\b(and also|plus|also|so|but|and)\b,?\s+([A-Za-z]+)/gi,
    category: 'cohesion',
    reason: 'Conversational opener; a scholarly connector signals the link more clearly.',
    replace: (match) => {
      const connector: Record<string, string> = { 'and also': 'Furthermore', plus: 'Moreover', also: 'Additionally', so: 'Therefore', but: 'However', and: 'In addition' }
      return `${connector[match[1].toLowerCase()]}, ${lowerStarter(match[2])}`
    },
  },
  {
    // Only the verb is edited, so a filler edit on the subject ("Basically, this") can sit beside it.
    pattern: /(?<=\b(?:this|these results|the results|our results|the data|it|which) )(proves?|clearly shows?|clearly demonstrates?) that\b/gi,
    category: 'hedging',
    reason: 'Overstates the strength of the claim; academic writing hedges what one study shows.',
    replace: (match) => (/s$/i.test(match[1]) ? 'indicates that' : 'indicate that'),
  },
  {
    pattern: /\b(don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't|it's|couldn't|shouldn't|wouldn't|haven't|hasn't|let's|that's|there's)\b/gi,
    category: 'vocabulary',
    reason: 'Contractions are informal in academic prose.',
    replace: (match) => {
      const full = CONTRACTIONS[match[1].toLowerCase().replace('’', "'")] ?? match[1]
      return /^[A-Z]/.test(match[1]) ? capitalize(full) : full
    },
  },
]

function atSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd()
  return before.length === 0 || /[.!?:]["”)]?$/.test(before)
}

function occurrences(text: string, part: string): number {
  if (!part) return 0
  let count = 0
  let from = 0
  while ((from = text.indexOf(part, from)) !== -1) {
    count += 1
    from += part.length
  }
  return count
}

/** Grow a span word by word until it occurs once, carrying the same tail onto the replacement. */
function uniqueEdit(text: string, start: number, end: number, refined: string): { original: string; refined: string; start: number; end: number } | null {
  let stop = end
  while (occurrences(text, text.slice(start, stop)) > 1) {
    const next = /^\s*\S+/.exec(text.slice(stop))
    if (!next) return null
    stop += next[0].length
  }
  return { original: text.slice(start, stop), refined: refined + text.slice(end, stop), start, end: stop }
}

interface PlacedEdit extends ToneEdit {
  start: number
  end: number
}

function ruleEdits(text: string, categories: ToneCategory[]): PlacedEdit[] {
  const edits: PlacedEdit[] = []
  for (const rule of RULES) {
    if (!categories.includes(rule.category)) continue
    rule.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rule.pattern.exec(text)) !== null) {
      const start = atSentenceStart(text, match.index)
      // Connectors only replace a conversational sentence opener, never "and" inside a sentence.
      if (rule.category === 'cohesion' && !start) continue
      // "So far", "So that", "But for", "Also known"... are not conversational openers.
      if (rule.category === 'cohesion' && /^(far|that|much|many|called|for|known|referred)$/i.test(match[2])) continue
      const placed = uniqueEdit(text, match.index, match.index + match[0].length, rule.replace(match, start))
      if (!placed || placed.original === placed.refined) continue
      edits.push({ ...placed, reason: rule.reason, ruleCategory: rule.category })
    }
  }
  return edits
}

const modelEditsSchema = z.object({
  edits: z
    .array(
      z.object({
        original: z.string().min(1).max(400),
        refined: z.string().max(800),
        reason: z.string().max(300).default(''),
        category: z.enum(['hedging', 'cohesion', 'conciseness', 'vocabulary']),
      })
    )
    .max(20),
})

async function modelEdits(text: string, categories: ToneCategory[], complete: ChatCompleter): Promise<PlacedEdit[]> {
  let reply: string
  try {
    reply = (await complete([{ role: 'user', content: text }], buildTonePrompt(categories))).text
  } catch {
    return []
  }
  const parsed = modelEditsSchema.safeParse(parseModelJson(reply))
  if (!parsed.success) return []
  const edits: PlacedEdit[] = []
  for (const edit of parsed.data.edits) {
    if (!categories.includes(edit.category)) continue
    // The span must be the user's own words, findable exactly once.
    if (occurrences(text, edit.original) !== 1) continue
    if (edit.refined === edit.original) continue
    if (edit.refined.length > Math.max(edit.original.length * 2, edit.original.length + 40)) continue
    if (checkNovelty(edit.refined, edit.original).length > 0) continue
    const start = text.indexOf(edit.original)
    edits.push({ original: edit.original, refined: edit.refined, reason: edit.reason || 'More formal academic phrasing.', ruleCategory: edit.category, start, end: start + edit.original.length })
  }
  return edits
}

const ROMAN = /^(?:[IVXLC]+)$/
const NOT_ACRONYMS = new Set(['OK', 'AM', 'PM', 'AD', 'BC', 'US', 'UK', 'EU', 'TV', 'ID'])

/** Acronyms whose first use in the text is not spelled out, unless the wider document defines them. */
function acronymNotices(text: string, contextText: string): ToneNotice[] {
  const notices: ToneNotice[] = []
  const seen = new Set<string>()
  const pattern = /\b([A-Z][A-Z0-9]{1,5})s?\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const term = match[1]
    if (seen.has(term)) continue
    seen.add(term)
    if (ROMAN.test(term) || NOT_ACRONYMS.has(term) || !/[A-Z].*[A-Z]/.test(term)) continue
    // A heading or emphasis line in capitals is not an acronym run.
    if (/^[^a-z]*$/.test(text.slice(Math.max(0, match.index - 30), match.index + term.length + 30))) continue
    const defined = new RegExp(`\\(\\s*${term}s?\\s*\\)|\\b${term}s?\\s*\\(\\s*[A-Za-z]`)
    if (defined.test(text.slice(0, match.index + term.length + 60)) || defined.test(contextText)) continue
    notices.push({
      category: 'acronym',
      term,
      message: `“${term}” is used without its full form. If this is its first use in the chapter, spell it out once, as “full name (${term})”.`,
    })
  }
  return notices.slice(0, 6)
}

/**
 * Polish the user's own sentences against four academic writing dimensions:
 * hedging, cohesion, conciseness and vocabulary. Rule-based edits run first
 * (filler, conversational openers, overclaims, contractions); the model adds
 * further edits that are kept only when their `original` is the user's exact
 * text and their `refined` adds no numbers, names or citations. Acronyms used
 * without a definition are reported as notices: the expansion can't be guessed.
 */
export async function refineAcademicTone(
  input: RefineToneInput,
  complete: ChatCompleter = aiClient.chatWithMeta
): Promise<ToneRefinement> {
  const text = input.text.slice(0, TONE_TEXT_MAX)
  const categories = FOCUS_CATEGORIES[input.focus]
  const candidates = [...ruleEdits(text, categories), ...(await modelEdits(text, categories, complete))]

  // Rule edits come first, so they win any overlap with a model edit.
  const kept: PlacedEdit[] = []
  for (const edit of candidates) {
    if (kept.some((other) => edit.start < other.end && other.start < edit.end)) continue
    kept.push(edit)
  }
  kept.sort((a, b) => a.start - b.start)

  return {
    edits: kept.slice(0, MAX_EDITS).map(({ original, refined, reason, ruleCategory }) => ({ original, refined, reason, ruleCategory })),
    notices: input.focus === 'all' || input.focus === 'clarity' ? acronymNotices(text, input.contextText ?? '') : [],
  }
}
