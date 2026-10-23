import { describe, expect, it } from 'vitest'

import { removeReferenceAndRenumber, type CitationReference } from './citationFormats'

const ref = (id: string, cited?: number): CitationReference => ({ id, type: 'journal', authors: ['A B'], title: id, year: 2020, cited })

describe('removeReferenceAndRenumber', () => {
  it('closes the gap and reports how each marker number changes', () => {
    const { references, mapping } = removeReferenceAndRenumber([ref('a', 1), ref('b', 2), ref('c', 3), ref('d')], 'b')
    expect(references.map((r) => [r.id, r.cited])).toEqual([['a', 1], ['c', 2], ['d', undefined]])
    expect(mapping.get(2)).toBeNull()
    expect(mapping.get(3)).toBe(2)
    expect(mapping.has(1)).toBe(false)
  })

  it('has nothing to remap when the removed source was never cited', () => {
    const { mapping } = removeReferenceAndRenumber([ref('a', 1), ref('b')], 'b')
    expect(mapping.size).toBe(0)
  })
})
