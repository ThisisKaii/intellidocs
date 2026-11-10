import { describe, expect, it } from 'vitest'
import {
  bodySuggestionDetail,
  bodySuggestionLabel,
  describeFix,
  lineSuggestionDetail,
  lineSuggestionLabel,
  sectionDisplayName,
} from './suggestionLabels'

describe('describeFix', () => {
  it('says what to change, action first', () => {
    expect(describeFix({ bold: false, italic: false })).toBe('Remove bold & italic')
    expect(describeFix({ bold: true, italic: false })).toBe('Make bold & remove italic')
    expect(describeFix({ textAlign: 'center', bold: true })).toBe('Make bold, center')
    expect(describeFix({ lineHeight: 2, firstIndentPt: 36 })).toBe('Double-space, add a 0.5in first-line indent')
    expect(describeFix({ fontSize: 12 })).toBe('Set text to 12pt')
  })

  it('keeps long fixes short', () => {
    expect(describeFix({ bold: false, fontSize: 12, textAlign: 'left', lineHeight: 2, firstIndentPt: 36 })).toBe(
      'Remove bold, set text to 12pt, align left +2 more'
    )
  })
})

describe('body suggestion wording', () => {
  it('reads plainly for one paragraph', () => {
    expect(bodySuggestionLabel({ bold: false, italic: false }, 1, 'Dedication')).toBe('Inconsistent formatting: Remove bold & italic')
    expect(bodySuggestionDetail(null)).toBe('Matches the rest of your body text')
    expect(bodySuggestionDetail('APA 7th Edition')).toBe('Matches the APA 7th Edition preset')
  })

  it('names the section and count for a group', () => {
    expect(bodySuggestionLabel({ bold: false, italic: false }, 4, 'Dedication')).toBe('Dedication (4 paragraphs) — Remove bold & italic')
    expect(bodySuggestionLabel({ bold: false }, 3, '')).toBe('3 paragraphs — Remove bold')
  })

  it('never uses the old robotic wording', () => {
    const label = bodySuggestionLabel({ bold: true, italic: true }, 1, '')
    expect(label).not.toMatch(/Body text is|match the rest of the document\?/)
  })
})

describe('line suggestion wording', () => {
  it('uses action titles for headings and title pages', () => {
    expect(lineSuggestionLabel('heading_1', 1)).toBe('Format as Chapter Heading')
    expect(lineSuggestionLabel('heading_2', 1)).toBe('Standardize Section Heading')
    expect(lineSuggestionLabel('title_page', 3)).toBe('Standardize 3 title page lines')
    expect(lineSuggestionDetail({ textAlign: 'center' }, null)).toBe('Center · matches the others')
  })
})

describe('sectionDisplayName', () => {
  it('turns shouted headings into names', () => {
    expect(sectionDisplayName('DEDICATION')).toBe('Dedication')
    expect(sectionDisplayName('STATEMENT OF THE PROBLEM:')).toBe('Statement of the Problem')
    expect(sectionDisplayName('Background of the Study')).toBe('Background of the Study')
  })
})
