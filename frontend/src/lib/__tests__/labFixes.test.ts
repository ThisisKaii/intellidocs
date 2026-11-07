import { describe, expect, it } from 'vitest'
import { createFrontMatterTracker } from '../frontMatter'
import { buildGrammarBlocks, type GrammarDocLike, type GrammarNodeLike } from '../grammarBlocks'
import { occurrenceNear } from '../grammarAnchor'
import { phaseLabel } from '../importQueue'
import { displayedLeader } from '@/components/editor/TabStop'

const PROSE = 'This sentence is long enough to read as running prose in the body of the thesis document.'

/** The region of each line, walking them in order. */
function regions(lines: Array<[string, boolean]>): Array<string | null> {
  const regionOf = createFrontMatterTracker()
  return lines.map(([text, heading]) => regionOf(text, heading))
}

describe('front-matter regions', () => {
  it('marks the title page and the approval sheet of a thesis', () => {
    expect(regions([
      ['A Proposal Project', false],
      ['presented to the Faculty of the College of Computer Studies,', false],
      ['Amamence, Marjun A.', false],
      ['APPROVAL SHEET', false],
      ['ALEXANDER Y. BUCOL, ED. D.', false],
      ['Chairman', false],
      ['ACKNOWLEDGEMENT', false],
      [PROSE, false],
    ])).toEqual(['title_page', 'title_page', 'title_page', 'approval_sheet', 'approval_sheet', 'approval_sheet', null, null])
  })

  it('finds no title page in a document that opens with a heading or with prose', () => {
    expect(regions([['INTRODUCTION', true], ['Short line', false]])).toEqual([null, null])
    expect(regions([[PROSE, false], ['Short line', false]])).toEqual([null, null])
  })

  it('travels on the grammar blocks the checker receives', () => {
    const node = (name: string, text: string): GrammarNodeLike => ({ isTextblock: true, textContent: text, type: { name }, attrs: {} })
    const doc: GrammarDocLike = {
      descendants: (callback) => {
        ;[node('paragraph', 'Ms. Gian S. Mahusay'), node('heading', 'CHAPTER I'), node('paragraph', PROSE)].forEach((entry, index) => {
          callback(entry, index, null)
        })
      },
    }
    expect(buildGrammarBlocks(doc).map((block) => block.region ?? null)).toEqual(['title_page', null, null])
  })
})

describe('grammar popover anchor', () => {
  it('picks the occurrence nearest the click, not the first in the block', () => {
    const text = 'teh first and teh second'
    expect(occurrenceNear(text, 'teh', 16)).toEqual({ start: 14, end: 17 })
    expect(occurrenceNear(text, 'teh', 0)).toEqual({ start: 0, end: 3 })
    expect(occurrenceNear(text, 'absent', 3)).toBeNull()
  })
})

describe('table of contents dot leaders', () => {
  const right = { align: 'right', leader: 'none' as const }

  it('draws dots on a right stop before a page number, for hand-made TOCs', () => {
    expect(displayedLeader(right, true, '12')).toBe('dot')
    expect(displayedLeader(right, true, ' iv ')).toBe('dot')
  })

  it('leaves other tabs as the document sets them', () => {
    expect(displayedLeader(right, true, 'Date')).toBe('none')
    expect(displayedLeader(right, false, '12')).toBe('none')
    expect(displayedLeader({ align: 'left', leader: 'none' }, true, '12')).toBe('none')
    expect(displayedLeader({ align: 'right', leader: 'hyphen' }, true, '12')).toBe('hyphen')
    expect(displayedLeader(null, true, '12')).toBe('none')
  })
})

describe('import progress label', () => {
  it('says the converter is waking up instead of showing a silent spinner', () => {
    expect(phaseLabel('converting', false, true)).toMatch(/^Waking up the converter/)
    expect(phaseLabel('converting', false, false)).toBe('Converting to editable text…')
  })
})
