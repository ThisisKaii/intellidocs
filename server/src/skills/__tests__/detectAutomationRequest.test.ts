import { detectAutomationRequest } from '../detectAutomationRequest'
import { parseFormattingIntent } from '../parseFormattingIntent'

describe('detectAutomationRequest', () => {
  it.each(['fix the figure numbering', 'renumber the captions', 'Renumber all figures and tables', 'the table numbers are wrong', 'correct the caption numbers'])(
    'renumbers captions: %s',
    (message) => {
      expect(detectAutomationRequest(message)).toEqual({ action: 'renumberCaptions' })
    }
  )

  it.each(['number the questions', 'make this a numbered list', 'fix the formatting', 'add page numbers'])('is not a caption renumbering: %s', (message) => {
    expect(detectAutomationRequest(message)).toBeNull()
  })
})

describe('numbers of things are not numbered lists', () => {
  it.each(['fix the figure numbering', 'the page numbers look off', 'chapter numbers'])('%s', (message) => {
    expect(parseFormattingIntent(message).formats).not.toContain('ordered_list')
  })

  it('still numbers lists and questions', () => {
    expect(parseFormattingIntent('number the questions').formats).toContain('ordered_list')
    expect(parseFormattingIntent('make this a numbered list').formats).toContain('ordered_list')
  })
})

describe('a plural heading level names those headings', () => {
  it('"heading 2s should be italic" changes the Heading 2s, not the selection', () => {
    expect(parseFormattingIntent('heading 2s should be italic')).toMatchObject({ targetCategory: 'h2Headings', formats: ['italic'], scope: 'all' })
  })
})
