import { describePosition, parseFormattingIntent } from '../parseFormattingIntent'
import { buildFormattingReply } from '../buildFormattingReply'
import { namesUnknownGroup } from '../routeAssistantRequest'

const TITLES = ['Introduction', 'Statement of the Problem']

describe('picking blocks by position', () => {
  it.each([
    ['make the 2nd paragraph bold', { targetCategory: 'paragraphs', targetIndex: 2, targetPage: null, target: null, formats: ['bold'] }],
    ['make the second paragraph of the introduction italic', { targetCategory: 'paragraphs', targetIndex: 2, target: 'introduction', targetMode: 'section' }],
    ['make the last table on page 4 centered', { targetCategory: 'tables', targetIndex: -1, targetPage: 4, formats: ['align_center'] }],
    ['make the first paragraph on page 3 12pt', { targetCategory: 'paragraphs', targetIndex: 1, targetPage: 3, fontSize: 12 }],
    ['make the headings on this page bold', { targetCategory: 'headings', targetIndex: null, targetPage: 'current' }],
    ['paragraph 3 should be justified', { targetCategory: 'paragraphs', targetIndex: 3, formats: ['align_justify'] }],
    ['make the first bullet list italic', { targetCategory: 'bulletLists', targetIndex: 1, formats: ['italic'] }],
    ['make page 3 double spaced', { targetCategory: 'all', targetIndex: null, targetPage: 3 }],
    ['make the 1st heading in chapter 2 bold', { targetCategory: 'headings', targetIndex: 1, target: 'chapter 2' }],
  ])('%s', (message, expected) => {
    const result = parseFormattingIntent(message, { knownTitles: TITLES })
    expect(result).toMatchObject({ scope: 'all', ...expected })
  })

  it('a position names where, never a format: "the first bullet list" is not "make a bullet list"', () => {
    expect(parseFormattingIntent('make the first bullet list italic').formats).toEqual(['italic'])
  })

  it('leaves heading levels, caption numbers and plain requests alone', () => {
    expect(parseFormattingIntent('make this heading 2').targetIndex).toBeNull()
    expect(parseFormattingIntent('make all headings bold').targetIndex).toBeNull()
    expect(parseFormattingIntent('add page numbers').targetPage).toBeNull()
  })

  it('says where in words', () => {
    expect(describePosition({ category: 'paragraphs', index: 2, page: null, within: 'introduction' })).toBe('the second paragraph of Introduction')
    expect(describePosition({ category: 'tables', index: -1, page: 4, within: null })).toBe('the last table on page 4')
    expect(describePosition({ category: 'headings', index: null, page: 'current', within: null })).toBe('the headings on this page')
    const intent = parseFormattingIntent('make the second paragraph of the introduction italic', { knownTitles: TITLES })
    expect(
      buildFormattingReply(
        { formats: intent.formats, fontSize: null, normalize: false, scope: 'all', target: intent.target, targetMode: intent.targetMode, targetCategory: intent.targetCategory, targetIndex: intent.targetIndex, targetPage: intent.targetPage, style: intent.style },
        'x'
      )
    ).toContain('the second paragraph of Introduction')
  })
})

describe('a block on a page without saying which', () => {
  it('is left to the AI rather than read as the whole page', () => {
    const message = 'the paragraph at the top of page 3 should be italic'
    const result = parseFormattingIntent(message)
    expect(result.targetPage).toBeNull()
    // The fixed rules would read it as the selection; the place it names sends it to the AI instead.
    expect(result.scope).toBe('selection')
    expect(namesUnknownGroup(message)).toBe(true)
  })
})

describe('opening and closing', () => {
  it('"the opening paragraph of statement of the problem" is its first paragraph, not its heading', () => {
    expect(parseFormattingIntent('the opening paragraph of statement of the problem should be italic', { knownTitles: TITLES })).toMatchObject({
      targetCategory: 'paragraphs',
      targetIndex: 1,
      target: 'statement of the problem',
      targetMode: 'section',
      formats: ['italic'],
    })
    expect(parseFormattingIntent('make the closing paragraph bold').targetIndex).toBe(-1)
  })
})
