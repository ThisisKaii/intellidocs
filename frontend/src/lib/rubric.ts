/** The four rubric criteria, 0-25 each, that sum to the overall grade (migration 044). */
export interface Rubric {
  content: number
  methodology: number
  formatting: number
  mechanics: number
}

export const RUBRIC_MAX = 25

export const RUBRIC_CRITERIA: ReadonlyArray<{ key: keyof Rubric; label: string; hint: string }> = [
  { key: 'content', label: 'Content', hint: 'Ideas, depth and accuracy' },
  { key: 'methodology', label: 'Methodology', hint: 'Approach, evidence and analysis' },
  { key: 'formatting', label: 'Formatting', hint: 'Layout, headings and citation style' },
  { key: 'mechanics', label: 'Mechanics', hint: 'Grammar, spelling and clarity' },
]

/** Rubric inputs as typed: blank fields are allowed while the professor fills them in. */
export type RubricDraft = Record<keyof Rubric, string>

export const EMPTY_RUBRIC: RubricDraft = { content: '', methodology: '', formatting: '', mechanics: '' }

/** Draft text for an existing rubric. */
export function rubricToDraft(rubric: Rubric | null | undefined): RubricDraft {
  if (!rubric) return { ...EMPTY_RUBRIC }
  return {
    content: String(rubric.content),
    methodology: String(rubric.methodology),
    formatting: String(rubric.formatting),
    mechanics: String(rubric.mechanics),
  }
}

/**
 * Read a draft: a complete rubric (all four 0-25), nothing when every field is
 * blank, or the first problem to show.
 */
export function parseRubric(draft: RubricDraft): { rubric: Rubric | null; error: string | null } {
  const filled = RUBRIC_CRITERIA.filter(({ key }) => draft[key].trim() !== '')
  if (filled.length === 0) return { rubric: null, error: null }
  const values: Partial<Rubric> = {}
  for (const { key, label } of RUBRIC_CRITERIA) {
    const text = draft[key].trim()
    const value = Number(text)
    if (text === '' || !Number.isFinite(value) || value < 0 || value > RUBRIC_MAX) {
      return { rubric: null, error: `Give ${label} a score from 0 to ${RUBRIC_MAX}` }
    }
    values[key] = value
  }
  return { rubric: values as Rubric, error: null }
}

/** The overall grade a rubric adds up to. */
export function rubricTotal(rubric: Rubric): number {
  return Math.round((rubric.content + rubric.methodology + rubric.formatting + rubric.mechanics) * 100) / 100
}

/** "Nov 10, 2026, 3:42 PM" for a comment or grade time. */
export function formatFeedbackTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
