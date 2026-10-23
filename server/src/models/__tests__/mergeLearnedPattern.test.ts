jest.mock('../../utils/redisClient', () => ({ getRedisClient: jest.fn() }))

import { mergeLearnedPattern } from '../behaviorModel'

const TEXT = 'Quarterly Results Overview'

describe('mergeLearnedPattern', () => {
  it('keeps bold learned when a later size-only event shows it absent', () => {
    const map = mergeLearnedPattern({}, 'bold', { text: TEXT, format: 'bold', bold: true })
    mergeLearnedPattern(map, 'font_size', { text: TEXT, bold: false, fontSize: 12 })
    const entry = map['quarterly results overview']
    expect(entry.bold).toBe(true)
    expect(entry.fontSize).toBe(12)
    expect(entry.count).toBe(2)
  })

  it('lets the mark\'s own toggle action switch it off', () => {
    const map = mergeLearnedPattern({}, 'bold', { text: TEXT, format: 'bold', bold: true })
    mergeLearnedPattern(map, 'bold', { text: TEXT, bold: false })
    expect(map['quarterly results overview'].bold).toBe(false)
  })

  it('ignores text that is too short to learn from', () => {
    expect(mergeLearnedPattern({}, 'bold', { text: 'ab', bold: true })).toEqual({})
  })
})
