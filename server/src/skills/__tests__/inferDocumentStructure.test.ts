import { inferDocumentStructure } from '../inferDocumentStructure'

describe('inferDocumentStructure', () => {
  it('detects an academic thesis from fulfillment and adviser markers', () => {
    const text = [
      'A Study of Slide Object Manipulation',
      'A Thesis Presented to the Faculty',
      'In Partial Fulfillment of the Requirements for the Degree of Bachelor of Science',
      'Adviser: Dr. Maria Santos',
    ].join('\n')

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('academic_thesis')
    expect(result.presetKey).toBe('uclm_capstone')
    expect(result.matchedMarkers.length).toBeGreaterThanOrEqual(2)
  })

  it('detects an IEEE manuscript from index terms and transactions markers', () => {
    const text = [
      'Deep Learning for Slide Recognition',
      'Abstract—This paper presents...',
      'Index Terms—Recognition, Processing',
      'IEEE Transactions on Pattern Analysis',
    ].join('\n')

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('ieee_manuscript')
    expect(result.presetKey).toBe('ieee')
  })

  it('detects an APA manuscript from running head and keywords markers', () => {
    const text = [
      'Running Head: FORMATTING BEHAVIOR',
      'Abstract',
      'This study examines formatting behavior.',
      'Keywords: formatting, prediction, editor',
    ].join('\n')

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('apa_manuscript')
    expect(result.presetKey).toBe('apa_7th')
  })

  it('returns unknown with no preset key when no markers match', () => {
    const result = inferDocumentStructure('Just some ordinary notes about lunch plans.')

    expect(result.type).toBe('unknown')
    expect(result.presetKey).toBeNull()
    expect(result.matchedMarkers).toEqual([])
  })

  it('favours the thesis profile when scores tie', () => {
    const text = 'A Thesis\nAbstract\nA short summary of the study.'

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('academic_thesis')
  })

  it('ignores markers that appear after the 3,000-character sample', () => {
    const padding = 'filler text '.repeat(300)
    const text = `${padding}\nIndex Terms—Late marker`

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('unknown')
  })

  it('matches markers case-insensitively and across line breaks', () => {
    const text = 'IN PARTIAL FULFILLMENT\nOF THE REQUIREMENTS\nfor graduation.'

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('academic_thesis')
    expect(result.matchedMarkers).toContain('in partial fulfillment of the requirements')
  })

  it('does not count IEEE markers that only appear in the References section', () => {
    const text = [
      'Notes on Slide Layout',
      'Some plain introductory prose about layout.',
      'References',
      '[1] A. Author, IEEE Transactions on Pattern Analysis, 2020.',
    ].join('\n')

    expect(inferDocumentStructure(text).type).toBe('unknown')
  })

  it('treats Abstract\u2014 and Index Terms\u2014 run-ins as strong IEEE markers', () => {
    const text = 'A Paper\nAbstract\u2014We study slides.\nIndex Terms\u2014slides, layout'

    const result = inferDocumentStructure(text)

    expect(result.type).toBe('ieee_manuscript')
    expect(result.matchedMarkers).toContain('abstract\u2014')
  })

  it('keeps an IEEE run-in abstract with Keywords: on the IEEE side', () => {
    const text = 'A Paper\nAbstract \u2014 We study slides.\nKeywords: slides, layout'

    expect(inferDocumentStructure(text).type).toBe('ieee_manuscript')
  })

  it('does not pick APA from Keywords: alone', () => {
    const result = inferDocumentStructure('A Paper\nSome text.\nKeywords: slides, layout')

    expect(result.type).toBe('unknown')
    expect(result.presetKey).toBeNull()
  })
})
