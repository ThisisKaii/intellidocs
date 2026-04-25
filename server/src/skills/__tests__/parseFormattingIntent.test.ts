import { parseFormattingIntent } from '../parseFormattingIntent'

describe('parseFormattingIntent', () => {
  it('detects underline requests', () => {
    const result = parseFormattingIntent('Please make this underlined')

    expect(result.format).toBe('underline')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('underline')
  })

  it('detects italic requests', () => {
    const result = parseFormattingIntent('Can you make this italic?')

    expect(result.format).toBe('italic')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('italic')
  })

  it('detects heading level requests', () => {
    const headingOne = parseFormattingIntent('Turn this into a heading 1')
    const headingTwo = parseFormattingIntent('Make this a section heading')
    const headingThree = parseFormattingIntent('Use a minor heading here')

    expect(headingOne.format).toBe('heading1')
    expect(headingOne.matchedPhrase).toBe('heading 1')

    expect(headingTwo.format).toBe('heading2')
    expect(headingTwo.matchedPhrase).toBe('section heading')

    expect(headingThree.format).toBe('heading3')
    expect(headingThree.matchedPhrase).toBe('minor heading')
  })

  it('detects list formatting requests', () => {
    const bulletList = parseFormattingIntent('Make this a bullet list')
    const numberedList = parseFormattingIntent('Convert this to a numbered list')

    expect(bulletList.format).toBe('unordered_list')
    expect(bulletList.matchedPhrase).toBe('bullet list')

    expect(numberedList.format).toBe('ordered_list')
    expect(numberedList.matchedPhrase).toBe('numbered list')
  })

  it('detects blockquote requests', () => {
    const result = parseFormattingIntent('Format this as a quoted section')

    expect(result.format).toBe('blockquote')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('quoted section')
  })

  it('returns no intent for general writing help', () => {
    const result = parseFormattingIntent('Can you improve the clarity of this paragraph?')

    expect(result.format).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.matchedPhrase).toBeNull()
  })
})