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

  it('detects each text alignment request', () => {
    const left = parseFormattingIntent('Align this to the left')
    const center = parseFormattingIntent('Center this please')
    const right = parseFormattingIntent('Align right')
    const justify = parseFormattingIntent('Justify this paragraph')

    expect(left.format).toBe('align_left')
    expect(center.format).toBe('align_center')
    expect(right.format).toBe('align_right')
    expect(justify.format).toBe('align_justify')
  })

  it('does not treat unrelated uses of "right" as an alignment request', () => {
    const result = parseFormattingIntent('Write the conclusion right now')

    expect(result.format).toBeNull()
  })

  it('combines alignment with other requested formats', () => {
    const result = parseFormattingIntent('Make this bold and align it center')

    expect(result.formats).toContain('bold')
    expect(result.formats).toContain('align_center')
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

  it('treats a heading category request as document-wide heading scope', () => {
    const result = parseFormattingIntent('Now format all headings and make them bold and centered')

    expect(result.scope).toBe('all')
    expect(result.targetCategory).toBe('headings')
    expect(result.formats).toContain('bold')
    expect(result.formats).toContain('align_center')
  })

  it('detects paragraph category requests', () => {
    const result = parseFormattingIntent('Justify all paragraphs')

    expect(result.scope).toBe('all')
    expect(result.targetCategory).toBe('paragraphs')
    expect(result.formats).toContain('align_justify')
  })

  it('handles "the rest" and "remaining" as bulk scope', () => {
    const rest = parseFormattingIntent('Bold the rest')
    const remaining = parseFormattingIntent('Format the remaining paragraphs')

    expect(rest.scope).toBe('all')
    expect(remaining.scope).toBe('all')
    expect(remaining.targetCategory).toBe('paragraphs')
  })

  it('keeps selection scope for a singular heading reference', () => {
    const result = parseFormattingIntent('Make this heading bold')

    expect(result.scope).toBe('selection')
    expect(result.targetCategory).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('extracts a quoted target and targets the whole document', () => {
    const result = parseFormattingIntent("remove the bold format of the 'approval sheet' text")

    expect(result.target).toBe('approval sheet')
    expect(result.scope).toBe('all')
    expect(result.normalize).toBe(true)
    expect(result.formats).toContain('bold')
  })

  it('extracts a double-quoted target', () => {
    const result = parseFormattingIntent('Make "List of Tables" bold')

    expect(result.target).toBe('list of tables')
    expect(result.scope).toBe('all')
  })

  it('extracts a phrase-prefixed target without swallowing command words', () => {
    const result = parseFormattingIntent('Format the text approval sheet bold')

    expect(result.target).toBe('approval sheet')
    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('does not treat a heading level as a target phrase', () => {
    const result = parseFormattingIntent('Make this heading 1')

    expect(result.target).toBeNull()
    expect(result.scope).toBe('selection')
  })

  it('does not treat a generic word after a heading prefix as a target', () => {
    const here = parseFormattingIntent('Use a minor heading here')
    const title = parseFormattingIntent('Make this title heading bold')
    const command = parseFormattingIntent('Change the heading to bold')
    const vague = parseFormattingIntent('Make the heading look better')

    expect(here.target).toBeNull()
    expect(title.target).toBeNull()
    expect(command.target).toBeNull()
    expect(vague.target).toBeNull()
  })

  it('extracts an explicitly marked phrase target', () => {
    const result = parseFormattingIntent('Make the title of the thesis bold')

    expect(result.target).toBe('thesis')
    expect(result.scope).toBe('all')
  })

  it('does not treat an apostrophe in a contraction as a quoted target', () => {
    const result = parseFormattingIntent("Don't change the formatting here")

    expect(result.target).toBeNull()
  })
})