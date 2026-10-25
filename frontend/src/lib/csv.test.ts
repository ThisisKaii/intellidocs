import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain values alone and blanks missing ones', () => {
    expect(csvCell('hello')).toBe('hello')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvCell('@cmd')).toBe("'@cmd")
  })

  it('does not touch negative numbers', () => {
    expect(csvCell(-5)).toBe('-5')
  })
})

describe('toCsv', () => {
  it('prints a heading line then one line per row', () => {
    const rows = [{ week: '2026-10-19', count: 3 }, { week: '2026-10-26', count: 0 }]
    expect(toCsv(rows, [{ key: 'week', label: 'Week' }, { key: 'count', label: 'Sign-ups' }])).toBe(
      'Week,Sign-ups\r\n2026-10-19,3\r\n2026-10-26,0',
    )
  })

  it('prints only the heading for no rows', () => {
    expect(toCsv([] as Array<{ a: number }>, [{ key: 'a', label: 'A' }])).toBe('A')
  })
})
