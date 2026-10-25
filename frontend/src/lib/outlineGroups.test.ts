import { describe, expect, it } from 'vitest'
import { groupRepeatedHeadings, nextOccurrence } from './outlineGroups'

describe('groupRepeatedHeadings', () => {
  const headings = [
    { id: 'a', text: 'ANNEX', level: 1 },
    { id: 'b', text: 'Intro', level: 2 },
    { id: 'c', text: 'annex ', level: 1 },
    { id: 'd', text: 'ANNEX', level: 2 },
  ]

  it('collapses same text at the same level and keeps document order', () => {
    const groups = groupRepeatedHeadings(headings)
    expect(groups.map((group) => [group.entry.id, group.count])).toEqual([['a', 2], ['b', 1], ['d', 1]])
  })
})

describe('nextOccurrence', () => {
  it('starts at the first and wraps around', () => {
    expect(nextOccurrence(undefined, 3)).toBe(0)
    expect(nextOccurrence(0, 3)).toBe(1)
    expect(nextOccurrence(2, 3)).toBe(0)
  })
})
