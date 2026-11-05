import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { buildGenreSignals, collectHeadings, genreShortLabel, hasMultiColumnSection, measureBodyTypography, GENRE_OPTIONS } from './genreSignals'

const HTML =
  '<h1>Chapter 1 Introduction</h1><p>MEMORANDUM</p><p>TO: All Staff</p>' +
  '<h2>1.1 Background of the Study</h2><p>Body text of the thesis.</p>'

function createEditor(): Editor {
  return new Editor({ extensions: [StarterKit], content: HTML })
}

describe('genreSignals', () => {
  it('collects heading text in order', () => {
    expect(collectHeadings(createEditor().state.doc)).toEqual(['Chapter 1 Introduction', '1.1 Background of the Study'])
  })

  it('reports no multi-column section for a plain document', () => {
    expect(hasMultiColumnSection(createEditor().state.doc)).toBe(false)
  })

  it('returns null typography without a rendered root', () => {
    expect(measureBodyTypography(null)).toEqual({ bodyFontPt: null, lineHeight: null })
  })

  it('builds the signal payload with line-separated sample text', () => {
    const signals = buildGenreSignals({
      doc: createEditor().state.doc,
      root: null,
      margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
      formattingPreset: 'uclm_capstone',
      twoColumnLayout: false,
    })
    expect(signals).toMatchObject({ formattingPreset: 'uclm_capstone', twoColumn: false, bodyFontPt: null })
    expect(signals.sample).toContain('MEMORANDUM\nTO: All Staff')
    expect(signals.headings).toHaveLength(2)
  })

  it('honours an import-level two-column layout', () => {
    const signals = buildGenreSignals({
      doc: createEditor().state.doc,
      root: null,
      margins: { top: 0.75, bottom: 1, left: 0.625, right: 0.625 },
      formattingPreset: null,
      twoColumnLayout: true,
    })
    expect(signals.twoColumn).toBe(true)
  })

  it('labels every genre option', () => {
    expect(GENRE_OPTIONS.map((option) => genreShortLabel(option.value))).toEqual(['IEEE', 'Thesis', 'Memo', 'General'])
  })
})
