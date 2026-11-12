import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RUBRIC,
  criterionId,
  emptyDraft,
  parseScores,
  readStoredRubric,
  rubricProblem,
  scoresToDraft,
  scoresTotal,
  type ClassRubric,
} from './rubric'

const CUSTOM: ClassRubric = {
  criteria: [
    { id: 'argument', name: 'Argument', description: '', maxPoints: 40 },
    { id: 'evidence', name: 'Evidence', description: '', maxPoints: 35 },
    { id: 'format', name: 'Format', description: 'University thesis format', maxPoints: 25 },
  ],
}

describe('class rubric scores', () => {
  it('reads a complete score form against the class rubric and adds it up', () => {
    const { scores, error } = parseScores(CUSTOM, { argument: '36', evidence: '30.5', format: '20' })
    expect(error).toBeNull()
    expect(scores).toEqual({ argument: 36, evidence: 30.5, format: 20 })
    expect(scoresTotal(scores!)).toBe(86.5)
  })

  it('treats an all-blank form as no rubric', () => {
    expect(parseScores(CUSTOM, emptyDraft(CUSTOM))).toEqual({ scores: null, error: null })
  })

  it("checks each score against that criterion's own points", () => {
    expect(parseScores(CUSTOM, { argument: '41', evidence: '1', format: '1' }).error).toBe('Give Argument a score from 0 to 40')
    expect(parseScores(CUSTOM, { argument: '20', evidence: '', format: '' }).error).toBe('Give Evidence a score from 0 to 35')
  })

  it('reads grades saved before class rubrics as the default rubric', () => {
    const read = readStoredRubric({ content: 22, methodology: 20, formatting: 24, mechanics: 23 })
    expect(read?.criteria).toEqual(DEFAULT_RUBRIC.criteria)
    expect(read?.scores).toEqual({ content: 22, methodology: 20, formatting: 24, mechanics: 23 })
  })

  it('refills the form from a saved grade', () => {
    const stored = { criteria: CUSTOM.criteria, scores: { argument: 30, evidence: 25, format: 18 } }
    expect(scoresToDraft(CUSTOM, stored)).toEqual({ argument: '30', evidence: '25', format: '18' })
    expect(scoresToDraft(CUSTOM, null)).toEqual({ argument: '', evidence: '', format: '' })
  })
})

describe('rubric editing', () => {
  it('requires names and points that add up to 100', () => {
    expect(rubricProblem(CUSTOM)).toBeNull()
    expect(rubricProblem(DEFAULT_RUBRIC)).toBeNull()
    expect(rubricProblem({ criteria: [{ ...CUSTOM.criteria[0], maxPoints: 50 }] })).toBe('The points add up to 50; they must add up to 100')
    expect(rubricProblem({ criteria: [{ ...CUSTOM.criteria[0], name: ' ', maxPoints: 100 }] })).toBe('Every criterion needs a name')
    expect(rubricProblem({ criteria: [] })).toBe('Add at least one criterion')
  })

  it('makes unique ids from criterion names', () => {
    expect(criterionId('Research Design!', new Set())).toBe('research-design')
    expect(criterionId('Format', new Set(['format']))).toBe('format-2')
  })
})
