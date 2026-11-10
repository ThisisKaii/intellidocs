import { describe, expect, it } from 'vitest'
import { classifyStructuralRole, isHeadingLike, mergeSameFixCandidates, type CandidateWording, type ScannerSuggestion } from '../useAutoFormatScanner'

describe('isHeadingLike', () => {
  it('accepts short numbered titles', () => {
    expect(isHeadingLike('3.1 Objectives of the Study')).toBe(true)
    expect(isHeadingLike('2. Review of Related Literature')).toBe(true)
    expect(isHeadingLike('IV. Results and Discussion')).toBe(true)
  })

  it('rejects numbered sentences', () => {
    expect(isHeadingLike('3.1 To develop a web-based editor that learns how each person formats documents.')).toBe(false)
    expect(isHeadingLike('1. The Department of Education (DepEd), through DepEd Memorandum No. 051, provides the guidelines.')).toBe(false)
    expect(isHeadingLike('3.2 to evaluate the accuracy')).toBe(false)
    expect(isHeadingLike('2. Results were recorded;')).toBe(false)
  })
})

describe('classifyStructuralRole with numbering', () => {
  it('keeps real headings', () => {
    expect(classifyStructuralRole('INTRODUCTION')).toBe('heading_1')
    expect(classifyStructuralRole('1. Introduction')).toBe('heading_1')
    expect(classifyStructuralRole('3.1 Objectives of the Study')).toBe('heading_2')
  })

  it('does not treat numbered objectives as headings', () => {
    expect(classifyStructuralRole('3.1 To develop a web-based editor that learns formatting.')).toBe('body_paragraph')
    expect(classifyStructuralRole('1. The Department of Education provides the guidelines.')).toBe('body_paragraph')
  })
})

describe('mergeSameFixCandidates', () => {
  const removeEmphasis = { role: 'body_paragraph' as const, bold: false, italic: false }
  function body(key: string, from: number, label = 'Inconsistent formatting: Remove bold & italic'): ScannerSuggestion {
    return { key, format: 'paragraph', confidence: 82, from, to: from + 10, pageNumber: 2, preview: key, label, captures: removeEmphasis, suggestionSource: 'learned' }
  }
  const wordings = new Map<string, CandidateWording>(
    ['d1', 'd2', 'd3', 'd4', 'x1'].map((key) => [key, { kind: 'body', fix: { bold: false, italic: false }, presetName: null }])
  )
  // Positions 0..99 are the Dedication section, 100+ the Acknowledgement section.
  const sectionOf = (pos: number) => (pos < 100 ? { id: 0, name: 'Dedication' } : { id: 1, name: 'Acknowledgement' })

  it('turns same-fix paragraphs in one section into one card', () => {
    const cards = mergeSameFixCandidates([body('d3', 40), body('d1', 10), body('d2', 25), body('d4', 55)], wordings, sectionOf)
    expect(cards).toHaveLength(1)
    const [card] = cards
    expect(card.label).toBe('Dedication (4 paragraphs) — Remove bold & italic')
    expect(card.from).toBe(10)
    expect(card.groupMembers?.map((member) => member.from)).toEqual([25, 40, 55])
    expect(card.memberKeys).toEqual(['d1', 'd2', 'd3', 'd4'])
  })

  it('keeps other sections and other fixes apart', () => {
    const cards = mergeSameFixCandidates(
      [body('d1', 10), body('d2', 25), body('x1', 120), { ...body('d3', 40, 'Inconsistent formatting: Remove bold'), captures: { role: 'body_paragraph', bold: false } }],
      wordings,
      sectionOf
    )
    expect(cards).toHaveLength(3)
    expect(cards.find((card) => card.key === 'x1')?.groupMembers).toBeUndefined()
    expect(cards.find((card) => card.key === 'd1')?.memberKeys).toEqual(['d1', 'd2'])
  })
})
