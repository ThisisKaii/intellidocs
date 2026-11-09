import { splitFormattingOperations } from '../splitFormattingOperations'
import { parseFormattingIntent } from '../parseFormattingIntent'
import { buildMultiFormattingReply } from '../buildFormattingReply'

describe('splitFormattingOperations', () => {
  it('splits the reviewer request into one change per instruction', () => {
    const { operations, unresolved } = splitFormattingOperations(
      'Center and bold the chapter heading. Format the section headings as Heading 2. Left-align body paragraphs. ' +
        'Format research questions as a numbered list. Apply consistent paragraph spacing.'
    )

    expect(operations).toHaveLength(3)
    expect(operations[0]).toMatchObject({ targetCategory: 'chapters' })
    expect(operations[0].formats).toEqual(expect.arrayContaining(['bold', 'align_center']))
    expect(operations[1]).toMatchObject({ targetCategory: 'sections', formats: ['heading2'] })
    expect(operations[2]).toMatchObject({ targetCategory: 'paragraphs', formats: ['align_left'] })
    // Nothing is dropped silently: what it cannot place is reported back.
    expect(unresolved).toEqual(['Format research questions as a numbered list', 'Apply consistent paragraph spacing'])
  })

  it('splits clauses joined by "and" when each names its own place', () => {
    const { operations } = splitFormattingOperations('Bold the chapter headings and italicize the section headings')
    expect(operations.map((op) => [op.targetCategory, op.formats])).toEqual([
      ['chapters', ['bold']],
      ['sections', ['italic']],
    ])
  })

  it('gives a heading level to each group without mixing them up', () => {
    const { operations } = splitFormattingOperations('Make the chapter headings heading 1 and the section headings heading 2')
    expect(operations.map((op) => [op.targetCategory, op.formats])).toEqual([
      ['chapters', ['heading1']],
      ['sections', ['heading2']],
    ])
  })

  it('keeps a single change with trailing formats as one operation', () => {
    const { operations, unresolved } = splitFormattingOperations('Format all headings and make them bold and centered')
    expect(operations).toHaveLength(1)
    expect(operations[0].formats).toEqual(expect.arrayContaining(['bold', 'align_center']))
    expect(unresolved).toEqual([])
  })

  it('reuses the previous change for a place named without a format', () => {
    const { operations } = splitFormattingOperations('Bold chapter 1 and chapter 2')
    expect(operations.map((op) => [op.target, op.formats])).toEqual([
      ['chapter 1', ['bold']],
      ['chapter 2', ['bold']],
    ])
  })

  it('does not split inside a quoted phrase', () => {
    const { operations } = splitFormattingOperations('Bold "Pros and Cons, Revisited" and center the title')
    // Targets are matched case-insensitively, so the parser keeps them lowercase.
    expect(operations.map((op) => op.target)).toEqual(['pros and cons, revisited', 'title'])
  })

  it('finds nothing to split in a plain selection request', () => {
    expect(splitFormattingOperations('Make this bold and center it').operations).toEqual([])
  })
})

describe('parseFormattingIntent heading fixes', () => {
  it('formats a quoted heading as only the level the user named', () => {
    const result = parseFormattingIntent('Format "BACKGROUND OF THE STUDY" as Heading 2')
    expect(result.formats).toEqual(['heading2'])
    expect(result.format).toBe('heading2')
  })

  it('keeps Heading 1 when the user names it', () => {
    expect(parseFormattingIntent('Format "Chapter 1" as heading 1').formats).toEqual(['heading1'])
  })

  it('treats "the section headings" as which blocks, not as a Heading 2 request', () => {
    const result = parseFormattingIntent('Bold the section headings')
    expect(result.formats).toEqual(['bold'])
    expect(result.targetCategory).toBe('sections')
  })

  it('still reads "make this a section heading" as Heading 2', () => {
    expect(parseFormattingIntent('Make this a section heading').formats).toEqual(['heading2'])
  })
})

describe('buildMultiFormattingReply', () => {
  it('lists every change and names what it left out', () => {
    const reply = buildMultiFormattingReply(
      [
        { formats: ['bold', 'align_center'], fontSize: null, normalize: false, scope: 'all', target: null, targetMode: null, targetCategory: 'chapters' },
        { formats: ['heading2'], fontSize: null, normalize: false, scope: 'all', target: null, targetMode: null, targetCategory: 'sections' },
      ],
      ['appendix'],
      ['Apply consistent paragraph spacing'],
      'request'
    )
    expect(reply).toContain('these 2 changes')
    expect(reply).toContain('(1) make every chapter heading bold and centered')
    expect(reply).toContain('(2) make every section heading a Heading 2')
    expect(reply).toContain('couldn’t find “appendix”')
    expect(reply).toContain('“Apply consistent paragraph spacing”')
  })
})
