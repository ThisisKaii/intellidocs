/** One criterion of a class rubric; the criteria's points add up to the 100-point grade. */
export interface RubricCriterion {
  id: string
  name: string
  description: string
  maxPoints: number
}

/** The rubric a professor grades a class with. */
export interface ClassRubric {
  criteria: RubricCriterion[]
}

/** A class's rubric as the server returns it: `custom` false means the class uses the default. */
export interface ClassRubricInfo {
  rubric: ClassRubric
  custom: boolean
  /** Only the class's own professor may change it. */
  canEdit?: boolean
  classFolderId?: string | null
}

/** Rubric scores keyed by criterion id. */
export type RubricScores = Record<string, number>

/**
 * A grade's rubric as stored on the review: the criteria it was graded with and the scores.
 * Grades given before class rubrics stored the four default scores directly.
 */
export type StoredRubric =
  | { criteria: RubricCriterion[]; scores: RubricScores }
  | { content: number; methodology: number; formatting: number; mechanics: number }

/** The rubric of a class whose professor has not set one: the four criteria grades used before. */
export const DEFAULT_RUBRIC: ClassRubric = {
  criteria: [
    { id: 'content', name: 'Content', description: 'Ideas, depth and accuracy', maxPoints: 25 },
    { id: 'methodology', name: 'Methodology', description: 'Approach, evidence and analysis', maxPoints: 25 },
    { id: 'formatting', name: 'Formatting', description: 'Layout, headings and citation style', maxPoints: 25 },
    { id: 'mechanics', name: 'Mechanics', description: 'Grammar, spelling and clarity', maxPoints: 25 },
  ],
}

/** The most criteria a rubric holds, and the grade its points add up to. */
export const MAX_CRITERIA = 12
export const RUBRIC_TOTAL_POINTS = 100

/** A stored grade rubric as criteria and scores, whichever shape it was saved in (null: no rubric). */
export function readStoredRubric(stored: StoredRubric | null | undefined): { criteria: RubricCriterion[]; scores: RubricScores } | null {
  if (!stored || typeof stored !== 'object') return null
  if ('criteria' in stored && Array.isArray(stored.criteria)) return { criteria: stored.criteria, scores: stored.scores ?? {} }
  if ('content' in stored) {
    const { content, methodology, formatting, mechanics } = stored
    return { criteria: DEFAULT_RUBRIC.criteria, scores: { content, methodology, formatting, mechanics } }
  }
  return null
}

/** Score inputs as typed: blank fields are allowed while the professor fills them in. */
export type RubricDraft = Record<string, string>

/** An empty score form for a rubric. */
export function emptyDraft(rubric: ClassRubric): RubricDraft {
  return Object.fromEntries(rubric.criteria.map((criterion) => [criterion.id, '']))
}

/** The score form for an existing grade: its scores where the criteria still match the rubric. */
export function scoresToDraft(rubric: ClassRubric, stored: StoredRubric | null | undefined): RubricDraft {
  const draft = emptyDraft(rubric)
  const read = readStoredRubric(stored)
  if (!read) return draft
  for (const criterion of rubric.criteria) {
    const score = read.scores[criterion.id]
    if (typeof score === 'number') draft[criterion.id] = String(score)
  }
  return draft
}

/**
 * Read a score form: every criterion scored within its points, nothing when every field is
 * blank, or the first problem to show.
 */
export function parseScores(rubric: ClassRubric, draft: RubricDraft): { scores: RubricScores | null; error: string | null } {
  const filled = rubric.criteria.filter((criterion) => (draft[criterion.id] ?? '').trim() !== '')
  if (filled.length === 0) return { scores: null, error: null }
  const scores: RubricScores = {}
  for (const criterion of rubric.criteria) {
    const text = (draft[criterion.id] ?? '').trim()
    const value = Number(text)
    if (text === '' || !Number.isFinite(value) || value < 0 || value > criterion.maxPoints) {
      return { scores: null, error: `Give ${criterion.name} a score from 0 to ${criterion.maxPoints}` }
    }
    scores[criterion.id] = value
  }
  return { scores, error: null }
}

/** The grade the scores add up to. */
export function scoresTotal(scores: RubricScores): number {
  return Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) * 100) / 100
}

/** The points a rubric's criteria add up to (a valid rubric: 100). */
export function rubricPoints(rubric: ClassRubric): number {
  return rubric.criteria.reduce((sum, criterion) => sum + (Number.isFinite(criterion.maxPoints) ? criterion.maxPoints : 0), 0)
}

/** A short id for a new criterion, from its name and unique within the rubric. */
export function criterionId(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'criterion'
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  return id
}

/** Why a rubric cannot be saved (missing names, points not adding to 100, …), else null. */
export function rubricProblem(rubric: ClassRubric): string | null {
  if (rubric.criteria.length === 0) return 'Add at least one criterion'
  if (rubric.criteria.length > MAX_CRITERIA) return `A rubric has at most ${MAX_CRITERIA} criteria`
  const unnamed = rubric.criteria.find((criterion) => !criterion.name.trim())
  if (unnamed) return 'Every criterion needs a name'
  const badPoints = rubric.criteria.find((criterion) => !Number.isInteger(criterion.maxPoints) || criterion.maxPoints < 1)
  if (badPoints) return `Give ${badPoints.name} whole points, at least 1`
  const total = rubricPoints(rubric)
  if (total !== RUBRIC_TOTAL_POINTS) return `The points add up to ${total}; they must add up to ${RUBRIC_TOTAL_POINTS}`
  return null
}

/** "Nov 10, 2026, 3:42 PM" for a comment or grade time. */
export function formatFeedbackTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
