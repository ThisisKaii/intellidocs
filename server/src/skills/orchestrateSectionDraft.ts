import { z } from 'zod'
import { aiClient, type ChatCompleter } from '../ai/aiClient'
import { parseModelJson } from '../ai/parseModelJson'
import { buildCohesionPrompt, buildStructuringPrompt, type RhetoricalMove } from '../ai/prompts/systemPrompts'
import { checkNovelty } from './checkNovelty'
import { TOPIC_REQUEST } from './detectWritingTask'

export interface SectionDraftInput {
  sectionTitle: string
  userNotes: string
  genre?: string
}

/** One move of the outline, listing the user's own note points it groups. */
export interface OutlineMove {
  name: string
  purpose: string
  notes: string[]
}

export interface StructuredSection {
  sectionTitle: string
  outline: OutlineMove[]
  paragraphs: string[]
  warnings: string[]
}

export type SectionDraftResult = { declined: string } | ({ declined?: undefined } & StructuredSection)

const MIN_POINTS = 2
const MIN_WORDS = 20
const MAX_NEW_WORD_RATIO = 0.3

const MOVE_SETS: Array<{ match: RegExp; moves: RhetoricalMove[] }> = [
  {
    match: /introduc|background|overview/i,
    moves: [
      { name: 'Establishing the context', purpose: 'the topic, its importance and what is already known' },
      { name: 'Identifying the gap', purpose: 'the problem, limitation or open question' },
      { name: 'Presenting this work', purpose: 'the aim, approach and contributions of this study' },
    ],
  },
  {
    match: /method|materials|procedure|design|implementation|approach/i,
    moves: [
      { name: 'Setting and data', purpose: 'participants, data sources, materials or system setup' },
      { name: 'Procedure', purpose: 'the steps, tools and techniques used' },
      { name: 'Analysis and evaluation', purpose: 'how results were measured, analysed or validated' },
    ],
  },
  {
    match: /result|finding/i,
    moves: [
      { name: 'Main findings', purpose: 'the primary outcomes and measurements' },
      { name: 'Supporting findings', purpose: 'secondary results, comparisons and observations' },
    ],
  },
  {
    match: /discuss|conclu|implication|recommend/i,
    moves: [
      { name: 'Interpreting the findings', purpose: 'what the results mean' },
      { name: 'Relating to other work', purpose: 'comparison with expectations or prior studies' },
      { name: 'Limitations and next steps', purpose: 'weaknesses, recommendations and future work' },
    ],
  },
  {
    match: /literature|related|review|theor/i,
    moves: [
      { name: 'Themes in prior work', purpose: 'what existing studies or theories establish' },
      { name: 'Debates and gaps', purpose: 'disagreements, weaknesses and what is missing' },
      { name: 'Position of this study', purpose: 'how this work builds on the literature' },
    ],
  },
]

const GENERIC_MOVES: RhetoricalMove[] = [
  { name: 'Main points', purpose: 'the central ideas of the section' },
  { name: 'Supporting details', purpose: 'explanations, examples and evidence for the main points' },
  { name: 'Implications', purpose: 'consequences or links to the rest of the document' },
]

const assignmentSchema = z.object({
  assignments: z.array(z.object({ note: z.coerce.number().int(), move: z.coerce.number().int() })).max(200),
})
const paragraphsSchema = z.object({
  paragraphs: z.array(z.object({ move: z.coerce.number().int(), text: z.string() })).max(20),
})

/** Split pasted notes into points: one per bullet or line, or per sentence for a single block of text. */
export function splitNotes(userNotes: string): string[] {
  const lines = userNotes
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•▪◦·]|\d+[.)]|[a-z][.)])\s+/i, '').trim())
    .filter((line) => line.length > 0)
  if (lines.length >= MIN_POINTS) return lines
  return (lines[0] ?? '')
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function movesFor(sectionTitle: string): RhetoricalMove[] {
  return MOVE_SETS.find((set) => set.match.test(sectionTitle))?.moves ?? GENERIC_MOVES
}

/** Stage 1: group note indices under moves. Falls back to one group in the user's order. */
async function structureNotes(
  sectionTitle: string,
  notes: string[],
  moves: RhetoricalMove[],
  complete: ChatCompleter
): Promise<number[][]> {
  const groups: number[][] = moves.map(() => [])
  try {
    const response = await complete(
      [{ role: 'user', content: notes.map((note, index) => `${index + 1}. ${note}`).join('\n') }],
      buildStructuringPrompt(sectionTitle, moves)
    )
    const parsed = assignmentSchema.safeParse(parseModelJson(response.text))
    if (!parsed.success) throw new Error('unparsable outline')
    const placed = new Set<number>()
    for (const { note, move } of parsed.data.assignments) {
      const noteIndex = note - 1
      const moveIndex = move - 1
      if (noteIndex < 0 || noteIndex >= notes.length || moveIndex < 0 || moveIndex >= moves.length) continue
      if (placed.has(noteIndex)) continue
      placed.add(noteIndex)
      groups[moveIndex].push(noteIndex)
    }
    if (placed.size === 0) throw new Error('empty outline')
    // A note the model skipped still belongs to the user's section: keep it with its predecessor's move.
    notes.forEach((_, noteIndex) => {
      if (placed.has(noteIndex)) return
      const previous = groups.findIndex((group) => group.includes(noteIndex - 1))
      groups[previous === -1 ? groups.length - 1 : previous].push(noteIndex)
    })
    return groups.map((group) => group.sort((a, b) => a - b))
  } catch {
    return [notes.map((_, index) => index), ...moves.slice(1).map(() => [])]
  }
}

/** Join notes with no rewording at all: the safe fallback when a rewrite adds content. */
function joinNotes(notes: string[]): string {
  return notes
    .map((note) => {
      const trimmed = note.trim()
      const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
      return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
    })
    .join(' ')
}

/** Stage 2: one cohesion call for all moves; returns text per move index, or null where the model gave none. */
async function joinIntoParagraphs(
  sectionTitle: string,
  groups: string[][],
  complete: ChatCompleter,
  feedback?: string
): Promise<Array<string | null>> {
  const content = groups.map((notes, index) => `Move ${index + 1}:\n${notes.map((note) => `- ${note}`).join('\n')}`).join('\n\n')
  const texts: Array<string | null> = groups.map(() => null)
  let reply: string
  try {
    const response = await complete(
      [{ role: 'user', content: feedback ? `${content}\n\nYour previous attempt was rejected because it ${feedback}. Use only the notes.` : content }],
      buildCohesionPrompt(sectionTitle)
    )
    reply = response.text
  } catch {
    return texts
  }
  const parsed = paragraphsSchema.safeParse(parseModelJson(reply))
  if (!parsed.success) return texts
  for (const { move, text } of parsed.data.paragraphs) {
    const index = move - 1
    if (index >= 0 && index < texts.length && text.trim()) texts[index] = text.trim()
  }
  return texts
}

/**
 * Organise the user's own notes into a formal section. Three stages, after
 * PaperOrchestra's agent split: a structuring agent groups the notes under
 * rhetorical moves (indices only), a cohesion agent joins each group into a
 * paragraph, and the editor's preset stylist formats them. Every paragraph is
 * checked against the notes; one that adds numbers, names, citations or new
 * material is retried once, then falls back to the notes joined verbatim.
 * Topic-only requests ("write an essay on X") are declined: IntelliDocs edits,
 * it does not ghostwrite.
 */
export async function orchestrateSectionDraft(
  input: SectionDraftInput,
  complete: ChatCompleter = aiClient.chatWithMeta
): Promise<SectionDraftResult> {
  const sectionTitle = input.sectionTitle.trim() || 'Untitled section'
  const notesText = input.userNotes.trim()
  const notes = splitNotes(notesText)
  const wordCount = notesText.split(/\s+/).filter(Boolean).length

  if (!notesText) {
    return { declined: 'Paste your own notes or draft after the request, for example "Organise my notes for the Methodology: - surveyed 40 students - ...". I organise and polish what you write; I don’t write sections from a topic.' }
  }
  if (TOPIC_REQUEST.test(notesText) && wordCount < 40) {
    return { declined: 'I can’t write a section from a topic, because IntelliDocs works with your own writing. Paste your notes or rough draft and I’ll organise them into formal paragraphs, find real sources for your claims, or polish your sentences.' }
  }
  if (notes.length < MIN_POINTS || wordCount < MIN_WORDS) {
    return { declined: `Those notes are too short to organise (I need at least ${MIN_POINTS} points and about ${MIN_WORDS} words). Add the points you want this section to make, one per line.` }
  }

  const moves = movesFor(sectionTitle)
  const groups = await structureNotes(sectionTitle, notes, moves, complete)
  const used = groups.map((indices, moveIndex) => ({ move: moves[moveIndex], notes: indices.map((index) => notes[index]) })).filter((entry) => entry.notes.length > 0)
  const noteGroups = used.map((entry) => entry.notes)

  const warnings: string[] = []
  let texts = await joinIntoParagraphs(sectionTitle, noteGroups, complete)
  const problems = texts.map((text, index) => (text ? checkNovelty(text, noteGroups[index].join('\n'), { maxNewWordRatio: MAX_NEW_WORD_RATIO }) : ['left this move out']))
  if (problems.some((list) => list.length > 0)) {
    const feedback = [...new Set(problems.flat())].slice(0, 4).join('; ')
    const retry = await joinIntoParagraphs(sectionTitle, noteGroups, complete, feedback)
    texts = texts.map((text, index) => {
      if (problems[index].length === 0) return text
      const second = retry[index]
      if (second && checkNovelty(second, noteGroups[index].join('\n'), { maxNewWordRatio: MAX_NEW_WORD_RATIO }).length === 0) return second
      warnings.push(
        text
          ? `“${used[index].move.name}” is your notes joined as written, because the polished version added material that wasn’t in them.`
          : `“${used[index].move.name}” is your notes joined as written, because the assistant couldn’t polish it right now.`
      )
      return null
    })
  }

  return {
    sectionTitle,
    outline: used.map((entry) => ({ name: entry.move.name, purpose: entry.move.purpose, notes: entry.notes })),
    paragraphs: texts.map((text, index) => text ?? joinNotes(noteGroups[index])),
    warnings,
  }
}
