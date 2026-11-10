import { splitFormattingOperations } from '../splitFormattingOperations'
import { looksLikeQuestion, parseFormattingIntent } from '../parseFormattingIntent'
import { buildMultiFormattingReply } from '../buildFormattingReply'

describe('splitFormattingOperations', () => {
  it('splits the reviewer request into one change per instruction', () => {
    const { operations, unresolved } = splitFormattingOperations(
      'Center and bold the chapter heading. Format the section headings as Heading 2. Left-align body paragraphs. ' +
        'Format research questions as a numbered list. Apply consistent paragraph spacing.'
    )

    expect(operations).toHaveLength(4)
    expect(operations[0]).toMatchObject({ targetCategory: 'chapters' })
    expect(operations[0].formats).toEqual(expect.arrayContaining(['bold', 'align_center']))
    expect(operations[1]).toMatchObject({ targetCategory: 'sections', formats: ['heading2'] })
    expect(operations[2]).toMatchObject({ targetCategory: 'paragraphs', formats: ['align_left'] })
    expect(operations[3]).toMatchObject({ targetCategory: 'questions', formats: ['ordered_list'] })
    // Nothing is dropped silently: what it cannot place is reported back.
    expect(unresolved).toEqual(['Apply consistent paragraph spacing'])
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

describe('12-prompt accuracy benchmark (parser side)', () => {
  it('#1 finds an unquoted section name and changes only its title line', () => {
    const result = parseFormattingIntent('Format Statement of the Problem as Heading 2')
    expect(result).toMatchObject({ target: 'statement of the problem', targetMode: 'heading', formats: ['heading2'], scope: 'all' })
  })

  it('#2 bolds and centers the Chapter 1 title line, not the chapter body', () => {
    const result = parseFormattingIntent('Make Chapter 1 bold and center it')
    expect(result).toMatchObject({ target: 'chapter 1', targetMode: 'heading' })
    expect(result.formats).toEqual(expect.arrayContaining(['bold', 'align_center']))
  })

  it('#4 targets the research questions for a numbered list', () => {
    const result = parseFormattingIntent('Convert the research questions into a numbered list')
    expect(result).toMatchObject({ targetCategory: 'questions', formats: ['ordered_list'], scope: 'all' })
  })

  it('#5 reads "section headings" as the place and 14pt + bold as the change', () => {
    const result = parseFormattingIntent('Make all section headings 14pt and bold')
    expect(result).toMatchObject({ targetCategory: 'sections', fontSize: 14, formats: ['bold'] })
  })

  it('#6 indents body paragraphs half an inch by default', () => {
    const result = parseFormattingIntent('Indent all body paragraphs')
    expect(result.targetCategory).toBe('paragraphs')
    expect(result.style.firstLineIndentIn).toBe(0.5)
    expect(parseFormattingIntent('indent the paragraphs 1 inch').style.firstLineIndentIn).toBe(1)
  })

  it('#7 reads double spacing and numeric line spacing for the whole document', () => {
    for (const prompt of ['Double space the document', 'Set line spacing to 2.0', 'make it double-spaced']) {
      const result = parseFormattingIntent(prompt)
      expect(result.style.lineSpacing).toBe(2)
      expect(result.scope).toBe('all')
    }
    expect(parseFormattingIntent('use 1.5 line spacing').style.lineSpacing).toBe(1.5)
    expect(parseFormattingIntent('single space this').style.lineSpacing).toBe(1)
    expect(parseFormattingIntent('single space this').scope).toBe('selection')
  })

  it('does not read paragraph spacing as line spacing', () => {
    expect(parseFormattingIntent('Apply consistent paragraph spacing').style.lineSpacing).toBeNull()
  })

  it('#8 reads the font family and size for the whole document', () => {
    const result = parseFormattingIntent('Change font to Times New Roman 12pt for the whole document')
    expect(result.style.fontFamily).toBe('Times New Roman')
    expect(result.fontSize).toBe(12)
    expect(result.scope).toBe('all')
  })

  it('#9 capitalizes and centers the document title', () => {
    const result = parseFormattingIntent('Capitalize the title and center it')
    expect(result).toMatchObject({ targetMode: 'title', formats: ['align_center'] })
    expect(result.style.textCase).toBe('upper')
    expect(parseFormattingIntent('Put the title in title case').style.textCase).toBe('title')
  })

  it('#10 asks for the APA preset instead of a Heading 1', () => {
    const result = parseFormattingIntent('Format in APA style')
    expect(result.preset).toBe('apa_7th')
    expect(result.formats).toEqual([])
    expect(parseFormattingIntent('Use the IEEE format').preset).toBe('ieee')
    // Citation style is not a document preset.
    expect(parseFormattingIntent('Cite this source in APA').preset).toBeNull()
  })

  it('#11 splits three changes, keeping each heading level with its own target', () => {
    const { operations, unresolved } = splitFormattingOperations(
      'Format Chapter 2 as Heading 1, Review of Related Literature as Heading 2, and left-align the paragraphs'
    )
    expect(operations.map((op) => [op.target, op.targetCategory, op.formats])).toEqual([
      ['chapter 2', 'all', ['heading1']],
      ['review of related literature', 'all', ['heading2']],
      [null, 'paragraphs', ['align_left']],
    ])
    expect(unresolved).toEqual([])
  })

  it('#12 treats a question about the document as a question', () => {
    expect(looksLikeQuestion('What is the main objective of this study?')).toBe(true)
    expect(looksLikeQuestion('How do I make the title bold?')).toBe(true)
    expect(looksLikeQuestion('Can you make the title bold?')).toBe(false)
    expect(looksLikeQuestion('Make the title bold')).toBe(false)
  })

  it('finds a section title from the open document outline without quotes', () => {
    const result = parseFormattingIntent('Make Behavioral Tracking & Feature Extraction italic', {
      knownTitles: ['CHAPTER II', 'Behavioral Tracking & Feature Extraction'],
    })
    expect(result).toMatchObject({ target: 'behavioral tracking & feature extraction', targetMode: 'heading' })
  })

  it('keeps a section title that contains "and" in one piece', () => {
    const { operations } = splitFormattingOperations('Make Scope and Delimitation bold and italicize the Conceptual Framework')
    expect(operations.map((op) => [op.target, op.formats])).toEqual([
      ['scope and delimitation', ['bold']],
      ['conceptual framework', ['italic']],
    ])
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
