import { describe, expect, it } from 'vitest'

import { citeReferences, removeReferenceAndRenumber, type CitationReference } from './citationFormats'

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

describe('citeReferences', () => {
  const vaswani: CitationReference = { id: 'v', type: 'conference', authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'], title: 'Attention Is All You Need', year: 2017, doi: '10.5555/X' }
  const smith: CitationReference = { id: 's', type: 'journal', authors: ['Jane Smith'], title: 'Deep Formatting', year: 2020 }

  it('numbers new IEEE sources after the ones already cited', () => {
    const { references, marker } = citeReferences([ref('a', 1), ref('b', 2)], [vaswani, smith], 'ieee')
    expect(marker).toBe('[3], [4]')
    expect(references.map((r) => [r.id, r.cited])).toEqual([['a', 1], ['b', 2], ['v', 3], ['s', 4]])
  })

  it('reuses a source already in the list instead of adding it twice', () => {
    const existing = { ...vaswani, id: 'old', doi: '10.5555/x', cited: 1 }
    const { references, marker } = citeReferences([existing], [vaswani], 'ieee')
    expect(references).toHaveLength(1)
    expect(marker).toBe('[1]')
  })

  it('joins APA citations alphabetically in one parenthesis', () => {
    expect(citeReferences([], [vaswani, smith], 'apa').marker).toBe('(Smith, 2020; Vaswani et al., 2017)')
  })
})
