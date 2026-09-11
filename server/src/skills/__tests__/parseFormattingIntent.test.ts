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

  it('detects multiple formats in one request', () => {
    const result = parseFormattingIntent('Make everything bold italic')

    expect(result.formats).toEqual(['bold', 'italic'])
    expect(result.format).toBe('bold')
  })

  it('detects whole-document scope', () => {
    const result = parseFormattingIntent('Apply bold to the whole document')

    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('detects a requested font size', () => {
    const result = parseFormattingIntent('Make everything bold italic font size 20')

    expect(result.fontSize).toBe(20)
    expect(result.scope).toBe('all')
    expect(result.formats).toEqual(['bold', 'italic'])
  })

  it('keeps selection scope by default', () => {
    const result = parseFormattingIntent('Make this heading 1')

    expect(result.scope).toBe('selection')
    expect(result.fontSize).toBeNull()
  })

  it('detects normalize/revert requests with a target font size', () => {
    const result = parseFormattingIntent('Make it that they go back to normal font 12pt')

    expect(result.normalize).toBe(true)
    expect(result.fontSize).toBe(12)
    expect(result.formats).toEqual([])
  })

  it('detects a bare "12pt" font size', () => {
    const result = parseFormattingIntent('Make the entire chapter 1 12pt')

    expect(result.fontSize).toBe(12)
  })

  it('detects chapter targets and treats them as whole-document scope', () => {
    const result = parseFormattingIntent('Make the entire chapter 1 bold')

    expect(result.target).toBe('chapter 1')
    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('normalizes word-numbers in chapter targets', () => {
    const result = parseFormattingIntent('Make chapter one italic')

    expect(result.target).toBe('chapter 1')
  })

  it('detects named sections as targets', () => {
    const result = parseFormattingIntent('Make the introduction 12pt')

    expect(result.target).toBe('introduction')
  })
})