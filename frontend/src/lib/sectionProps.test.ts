import { describe, expect, it } from 'vitest'
import { readSectionProps } from './sectionProps'
import { SAMPLE_SECTION } from './sectionProps.fixture'

describe('readSectionProps', () => {
  it('reads complete section properties', () => {
    expect(readSectionProps(JSON.parse(JSON.stringify(SAMPLE_SECTION)))).toEqual(SAMPLE_SECTION)
  })

  it('reads uneven columns and a continuous section', () => {
    const two = { ...SAMPLE_SECTION, kind: 'continuous', columns: { count: 2, gap: 24, widths: [300, 320] } }
    expect(readSectionProps(two)?.columns.widths).toEqual([300, 320])
  })

  it.each([
    ['an unknown kind', { kind: 'nextColumn' }],
    ['a negative margin', { margins: { ...SAMPLE_SECTION.margins, left: -4 } }],
    ['a missing margin', { margins: { top: 1, right: 1, bottom: 1, left: 1 } }],
    ['column widths that do not match the count', { columns: { count: 2, gap: 24, widths: [300] } }],
    ['zero columns', { columns: { count: 0, gap: 0, widths: null } }],
    ['a non-string part key', { headers: { default: 7, first: null, even: null } }],
    ['a fractional restart number', { numbering: { start: 1.5, format: 'decimal' } }],
    ['an absurd page size', { page: { width: 1e9, height: 100 } }],
  ])('rejects %s', (_label, change) => {
    expect(readSectionProps({ ...SAMPLE_SECTION, ...change })).toBeNull()
  })

  it('rejects things that are not objects', () => {
    expect(readSectionProps(null)).toBeNull()
    expect(readSectionProps('nextPage')).toBeNull()
    expect(readSectionProps([SAMPLE_SECTION])).toBeNull()
  })
})
