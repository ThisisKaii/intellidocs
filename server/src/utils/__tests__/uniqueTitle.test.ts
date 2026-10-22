import { nextUniqueTitle } from '../uniqueTitle'

describe('nextUniqueTitle', () => {
  it('returns the title untouched when nothing collides', () => {
    expect(nextUniqueTitle('Report', ['Other'])).toBe('Report')
  })

  it('numbers the first duplicate "(1)"', () => {
    expect(nextUniqueTitle('Report', ['Report'])).toBe('Report (1)')
  })

  it('skips numbers that are already taken', () => {
    expect(nextUniqueTitle('Report', ['Report', 'Report (1)', 'Report (2)'])).toBe('Report (3)')
  })

  it('fills the lowest free number', () => {
    expect(nextUniqueTitle('Report', ['Report', 'Report (2)'])).toBe('Report (1)')
  })

  it('ignores case and surrounding whitespace', () => {
    expect(nextUniqueTitle('  report ', ['REPORT'])).toBe('report (1)')
  })
})
