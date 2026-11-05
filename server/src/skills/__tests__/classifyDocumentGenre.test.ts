import { classifyDocumentGenre } from '../classifyDocumentGenre'
import { genreForPreset, resolveDocumentGenre, GENRE_BASE_PRESET_KEY } from '../../utils/documentGenre'

describe('genreForPreset', () => {
  it.each([
    ['ieee', 'ieee'],
    ['ieee__v2', 'ieee'],
    ['uclm_capstone', 'thesis'],
    ['thesis', 'thesis'],
    ['academic', 'thesis'],
    ['business_letter', 'memo'],
    ['apa_7th', 'general'],
    ['general', 'general'],
    ['custom', 'general'],
    ['something_else', 'general'],
  ])('%s → %s', (preset, genre) => {
    expect(genreForPreset(preset)).toBe(genre)
  })

  it('maps a missing preset to general', () => {
    expect(genreForPreset(null)).toBe('general')
    expect(genreForPreset(undefined)).toBe('general')
  })

  it('prefers a stored genre over the preset', () => {
    expect(resolveDocumentGenre({ genre: 'memo', formatting_preset: 'ieee' })).toBe('memo')
    expect(resolveDocumentGenre({ genre: 'nonsense', formatting_preset: 'ieee' })).toBe('ieee')
  })

  it('has a base preset for every genre', () => {
    expect(Object.keys(GENRE_BASE_PRESET_KEY).sort()).toEqual(['general', 'ieee', 'memo', 'thesis'])
  })
})

describe('classifyDocumentGenre', () => {
  it('detects an IEEE paper from layout alone', () => {
    const result = classifyDocumentGenre({
      twoColumn: true,
      bodyFontPt: 10,
      margins: { top: 0.75, bottom: 1, left: 0.625, right: 0.625 },
    })
    expect(result.genre).toBe('ieee')
    expect(result.reasons).toContain('Two-column layout')
  })

  it('detects an IEEE paper from its markers', () => {
    const result = classifyDocumentGenre({
      sample: 'Deep Learning for Formatting\nAbstract—We study... Index Terms—formatting, learning',
      headings: ['I. Introduction', 'II. Related Work'],
    })
    expect(result.genre).toBe('ieee')
  })

  it('detects a thesis from spacing, margins and chapters', () => {
    const result = classifyDocumentGenre({
      bodyFontPt: 12,
      lineHeight: 2,
      margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
      headings: ['Acknowledgements', 'Chapter 1 Introduction', 'Chapter 2 Review of Related Literature'],
    })
    expect(result.genre).toBe('thesis')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('detects a memo from its header block', () => {
    const result = classifyDocumentGenre({
      sample: 'MEMORANDUM\nTO: All Staff\nFROM: Registrar\nDATE: 5 November 2026\nSUBJECT: Enrollment',
    })
    expect(result.genre).toBe('memo')
  })

  it('keeps weak evidence as general', () => {
    expect(classifyDocumentGenre({ bodyFontPt: 12, lineHeight: 1.15 }).genre).toBe('general')
    expect(classifyDocumentGenre({}).genre).toBe('general')
  })

  it('lets the preset outweigh a single contrary hint', () => {
    expect(classifyDocumentGenre({ formattingPreset: 'uclm_capstone', bodyFontPt: 10 }).genre).toBe('thesis')
  })

  it('does not specialize an APA (general) preset', () => {
    expect(classifyDocumentGenre({ formattingPreset: 'apa_7th', lineHeight: 1.15 }).genre).toBe('general')
  })
})
