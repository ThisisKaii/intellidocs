import { describe, expect, it } from 'vitest'
import { EMPTY_RUBRIC, parseRubric, rubricToDraft, rubricTotal } from './rubric'

describe('rubric', () => {
  it('reads a complete rubric and adds it up', () => {
    const { rubric, error } = parseRubric({ content: '22', methodology: '20', formatting: '24.5', mechanics: '23' })
    expect(error).toBeNull()
    expect(rubric).toEqual({ content: 22, methodology: 20, formatting: 24.5, mechanics: 23 })
    expect(rubricTotal(rubric!)).toBe(89.5)
  })

  it('treats an all-blank rubric as none', () => {
    expect(parseRubric(EMPTY_RUBRIC)).toEqual({ rubric: null, error: null })
  })

  it('names the first criterion that is missing or out of range', () => {
    expect(parseRubric({ ...EMPTY_RUBRIC, content: '20' }).error).toBe('Give Methodology a score from 0 to 25')
    expect(parseRubric({ content: '26', methodology: '1', formatting: '1', mechanics: '1' }).error).toBe('Give Content a score from 0 to 25')
  })

  it('round-trips a saved rubric into the form', () => {
    expect(rubricToDraft({ content: 1, methodology: 2, formatting: 3, mechanics: 4 })).toEqual({ content: '1', methodology: '2', formatting: '3', mechanics: '4' })
    expect(rubricToDraft(null)).toEqual(EMPTY_RUBRIC)
  })
})
