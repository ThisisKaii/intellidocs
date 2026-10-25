import { bucketByWeek, weekStart } from '../weeklyBuckets'

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart(new Date('2026-10-25T10:00:00Z'))).toBe('2026-10-19')
    expect(weekStart(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19')
  })
})

describe('bucketByWeek', () => {
  const now = new Date('2026-10-25T12:00:00Z')

  it('keeps empty weeks and counts each timestamp in its week', () => {
    const result = bucketByWeek(['2026-10-20T01:00:00Z', '2026-10-24T01:00:00Z', '2026-10-05T01:00:00Z'], 4, now)
    expect(result.map((r) => r.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
    expect(result.map((r) => r.count)).toEqual([0, 1, 0, 2])
  })

  it('ignores dates outside the window and invalid dates', () => {
    const result = bucketByWeek(['2020-01-01T00:00:00Z', 'nope'], 2, now)
    expect(result.every((r) => r.count === 0)).toBe(true)
  })
})
