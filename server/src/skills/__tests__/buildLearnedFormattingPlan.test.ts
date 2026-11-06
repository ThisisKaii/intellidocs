import {
  buildLearnedFormattingPlan,
  formatsForPattern,
  isUsualFormattingRequest,
  learnedFormattingReply,
} from '../buildLearnedFormattingPlan'
import type { LearnedFormatPattern } from '../../types/index'

const pattern = (over: Partial<LearnedFormatPattern>): LearnedFormatPattern => ({
  format: 'bold',
  snippet: 'Introduction',
  bold: false,
  italic: false,
  underline: false,
  fontSize: null,
  count: 1,
  lastAt: '2026-11-01T00:00:00.000Z',
  ...over,
})

describe('isUsualFormattingRequest', () => {
  it.each([
    'Apply my usual formatting',
    'please use my learned style',
    'Format the document automatically',
    'format this document my way',
    'auto-format the document',
    'format it like I usually do',
  ])('recognizes "%s"', (message) => {
    expect(isUsualFormattingRequest(message)).toBe(true)
  })

  it.each(['make the title bold', 'what is the usual length of an abstract?', 'format chapter 1 as heading 1'])(
    'leaves "%s" to the other handlers',
    (message) => {
      expect(isUsualFormattingRequest(message)).toBe(false)
    }
  )
})

describe('buildLearnedFormattingPlan', () => {
  it('turns patterns into editor formats, most-used first', () => {
    const rules = buildLearnedFormattingPlan({
      introduction: pattern({ format: 'heading1', bold: true, textAlign: 'center', count: 4 }),
      'references': pattern({ format: 'fontSize', fontSize: 14, count: 2 }),
    })
    expect(rules.map((rule) => [rule.key, rule.formats, rule.fontSize])).toEqual([
      ['introduction', ['heading1', 'bold', 'align_center'], null],
      ['references', [], 14],
    ])
    expect(rules[0].confidence).toBeCloseTo(0.92)
  })

  it('drops patterns with nothing the editor can apply', () => {
    expect(buildLearnedFormattingPlan({ abstract: pattern({ format: 'paste' }) })).toEqual([])
  })

  it('maps h1-h3 shorthands', () => {
    expect(formatsForPattern(pattern({ format: 'h2' }))).toEqual(['heading2'])
  })

  it('says when nothing was learned for the genre', () => {
    expect(learnedFormattingReply('ieee', [])).toContain("haven't learned any IEEE formatting habits")
  })
})
