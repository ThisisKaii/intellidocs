import { learnedConfidence, learnedKey, learnedTextMatch } from '../learnedTextMatch'

describe('learnedTextMatch', () => {
  const key = learnedKey('Chapter 1. introduction')

  it('matches the same text exactly', () => {
    expect(learnedTextMatch(key, 'chapter 1.   Introduction')).toBe('exact')
  })

  it('matches the same kind of line written differently', () => {
    expect(learnedTextMatch(key, 'Chapter 1 Introduction')).toBe('family')
    expect(learnedTextMatch(key, 'Chapter II Review of Related Literature')).toBe('family')
    expect(learnedTextMatch(key, 'CHAPTER 3. METHODOLOGY')).toBe('family')
  })

  it('does not match ordinary sentences that merely share a word', () => {
    expect(learnedTextMatch(key, 'This chapter presents the background of the study.')).toBeNull()
    expect(learnedTextMatch(key, 'Introduction')).toBeNull()
  })

  it('ranks a family match below an exact one', () => {
    expect(learnedConfidence(1, 'family')).toBeLessThan(learnedConfidence(1, 'exact'))
  })
})
