import { describe, expect, it } from 'vitest'
import { classifyStructuralRole, isHeadingLike } from '../useAutoFormatScanner'

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
