import { looksLikeQuestion, parseFormattingIntent } from '../parseFormattingIntent'

describe('parseFormattingIntent', () => {
  it('detects underline requests', () => {
    const result = parseFormattingIntent('Please make this underlined')

    expect(result.format).toBe('underline')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('underline')
  })

  it('detects italic requests', () => {
    const result = parseFormattingIntent('Can you make this italic?')

    expect(result.format).toBe('italic')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('italic')
  })

  it('detects heading level requests', () => {
    const headingOne = parseFormattingIntent('Turn this into a heading 1')
    const headingTwo = parseFormattingIntent('Make this a section heading')
    const headingThree = parseFormattingIntent('Use a minor heading here')

    expect(headingOne.format).toBe('heading1')
    expect(headingOne.matchedPhrase).toBe('heading 1')

    expect(headingTwo.format).toBe('heading2')
    expect(headingTwo.matchedPhrase).toBe('section heading')

    expect(headingThree.format).toBe('heading3')
    expect(headingThree.matchedPhrase).toBe('minor heading')
  })

  it('detects list formatting requests', () => {
    const bulletList = parseFormattingIntent('Make this a bullet list')
    const numberedList = parseFormattingIntent('Convert this to a numbered list')

    expect(bulletList.format).toBe('unordered_list')
    expect(bulletList.matchedPhrase).toBe('bullet list')

    expect(numberedList.format).toBe('ordered_list')
    expect(numberedList.matchedPhrase).toBe('numbered list')
  })

  it('detects blockquote requests', () => {
    const result = parseFormattingIntent('Format this as a quoted section')

    expect(result.format).toBe('blockquote')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matchedPhrase).toBe('quoted section')
  })

  it('detects each text alignment request', () => {
    const left = parseFormattingIntent('Align this to the left')
    const center = parseFormattingIntent('Center this please')
    const right = parseFormattingIntent('Align right')
    const justify = parseFormattingIntent('Justify this paragraph')

    expect(left.format).toBe('align_left')
    expect(center.format).toBe('align_center')
    expect(right.format).toBe('align_right')
    expect(justify.format).toBe('align_justify')
  })

  it('does not treat unrelated uses of "right" as an alignment request', () => {
    const result = parseFormattingIntent('Write the conclusion right now')

    expect(result.format).toBeNull()
  })

  it('combines alignment with other requested formats', () => {
    const result = parseFormattingIntent('Make this bold and align it center')

    expect(result.formats).toContain('bold')
    expect(result.formats).toContain('align_center')
  })

  it('returns no intent for general writing help', () => {
    const result = parseFormattingIntent('Can you improve the clarity of this paragraph?')

    expect(result.format).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.matchedPhrase).toBeNull()
  })

  it('detects multiple formats in one request', () => {
    const result = parseFormattingIntent('Make everything bold italic')

    expect(result.formats).toEqual(['bold', 'italic'])
    expect(result.format).toBe('bold')
  })

  it('detects whole-document scope', () => {
    const result = parseFormattingIntent('Apply bold to the whole document')

    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('detects a requested font size', () => {
    const result = parseFormattingIntent('Make everything bold italic font size 20')

    expect(result.fontSize).toBe(20)
    expect(result.scope).toBe('all')
    expect(result.formats).toEqual(['bold', 'italic'])
  })

  it('keeps selection scope by default', () => {
    const result = parseFormattingIntent('Make this heading 1')

    expect(result.scope).toBe('selection')
    expect(result.fontSize).toBeNull()
  })

  it('detects normalize/revert requests with a target font size', () => {
    const result = parseFormattingIntent('Make it that they go back to normal font 12pt')

    expect(result.normalize).toBe(true)
    expect(result.fontSize).toBe(12)
    expect(result.formats).toEqual([])
  })

  it('detects a bare "12pt" font size', () => {
    const result = parseFormattingIntent('Make the entire chapter 1 12pt')

    expect(result.fontSize).toBe(12)
  })

  it('detects chapter targets and treats them as whole-document scope', () => {
    const result = parseFormattingIntent('Make the entire chapter 1 bold')

    expect(result.target).toBe('chapter 1')
    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('normalizes word-numbers in chapter targets', () => {
    const result = parseFormattingIntent('Make chapter one italic')

    expect(result.target).toBe('chapter 1')
  })

  it('detects named sections as targets', () => {
    const result = parseFormattingIntent('Make the introduction 12pt')

    expect(result.target).toBe('introduction')
  })

  it('treats a heading category request as document-wide heading scope', () => {
    const result = parseFormattingIntent('Now format all headings and make them bold and centered')

    expect(result.scope).toBe('all')
    expect(result.targetCategory).toBe('headings')
    expect(result.formats).toContain('bold')
    expect(result.formats).toContain('align_center')
  })

  it.each([
    ['Make all headers 12pt', 12],
    ['Make all the headers 12pt font size', 12],
    ['change every header font size to 12', 12],
    ['set the headers to size 14', 14],
  ])('reads "headers" as the headings category: %s', (message, size) => {
    const result = parseFormattingIntent(message)

    expect(result.scope).toBe('all')
    expect(result.targetCategory).toBe('headings')
    expect(result.fontSize).toBe(size)
    expect(result.formats).toEqual([])
  })

  it.each([
    ['make all paras 12pt', 'paragraphs', []],
    ['make the body text 12pt', 'paragraphs', []],
    ['make all subheaders bold', 'sections', ['bold']],
    ['make all titles bold', 'headings', ['bold']],
    ['make all bullet lists 12pt', 'bulletLists', []],
    ['make the bullet points italic', 'bulletLists', ['italic']],
    ['make every bullet 12pt', 'bulletLists', []],
    ['make all numbered lists bold', 'numberedLists', ['bold']],
    ['make all lists 12pt', 'lists', []],
    ['make the list items 12pt', 'lists', []],
    ['make all the tables 10pt', 'tables', []],
    ['make all table captions italic', 'captions', ['italic']],
    ['make all captions italic', 'captions', ['italic']],
    ['make all block quotes italic', 'quotes', ['italic']],
  ])('names a block category without applying it as a format: %s', (message, category, formats) => {
    const result = parseFormattingIntent(message)

    expect(result.targetCategory).toBe(category)
    expect(result.scope).toBe('all')
    expect(result.formats).toEqual(formats)
  })

  describe('requests that used to do the opposite', () => {
    it.each([
      ['make the bullet points not bold', 'bulletLists'],
      ['dont make the headings bold', 'headings'],
      ["don't make the headings bold", 'headings'],
      ['do not make the headings bold', 'headings'],
      ['unbold all headers', 'headings'],
    ])('a negated mark removes it: %s', (message, category) => {
      expect(parseFormattingIntent(message)).toMatchObject({ formats: ['bold'], normalize: true, targetCategory: category })
      expect(looksLikeQuestion(message)).toBe(false)
    })

    it('a negated mark next to another change is just left out', () => {
      expect(parseFormattingIntent('make the headings bold but not italic')).toMatchObject({ formats: ['bold'], normalize: false })
    })

    it('"don\'t" with nothing to remove asks for no change', () => {
      const result = parseFormattingIntent("don't center the headings")
      expect(result.formats).toEqual([])
      expect(result.normalize).toBe(false)
      expect(parseFormattingIntent("don't forget to bold the headings")).toMatchObject({ formats: ['bold'], normalize: false })
    })

    it.each([
      ['make everything except headings 12pt', 'except:headings'],
      ['make all text 12pt except the tables', 'except:tables'],
      ['italicize everything other than the bullet points', 'except:bulletLists'],
    ])('"except" leaves that category alone: %s', (message, category) => {
      const result = parseFormattingIntent(message)
      expect(result.targetCategory).toBe(category)
      expect(result.scope).toBe('all')
      expect(result.formats).not.toContain('unordered_list')
    })

    it.each([
      ['make all h2 12pt', 'h2Headings'],
      ['make headings 1 12pt', 'h1Headings'],
      ['make every heading 3 12pt', 'h3Headings'],
      ['make the level 2 headings 12pt', 'h2Headings'],
    ])('a heading level names those headings, not a level to apply: %s', (message, category) => {
      expect(parseFormattingIntent(message)).toMatchObject({ targetCategory: category, formats: [], fontSize: 12 })
    })

    it('still applies a heading level when one is asked for', () => {
      expect(parseFormattingIntent('make all headings h2')).toMatchObject({ targetCategory: 'headings', formats: ['heading2'] })
      expect(parseFormattingIntent('make this heading 2')).toMatchObject({ targetCategory: 'all', formats: ['heading2'] })
    })
  })

  describe('font sizes in everyday words', () => {
    it.each([
      ['headers should be 12', 12],
      ['change the headings to 14', 14],
      ['make all headings 12', 12],
      ['make headers twelve point', 12],
      ['make the headings twenty four pt', 24],
      ['make all headings 12 px', 12],
      ['set heading font size 12', 12],
    ])('%s', (message, size) => {
      const result = parseFormattingIntent(message)
      expect(result.fontSize).toBe(size)
      expect(result.targetCategory).toBe('headings')
    })

    it.each([
      'make chapter 12 bold',
      'set the line spacing to 2',
      'number the questions 1 to 10',
      'change heading 2 to bold',
      'indent the paragraphs to 1',
    ])('a number that is not a size: %s', (message) => {
      expect(parseFormattingIntent(message).fontSize).toBeNull()
    })

    it.each([
      ['can u make the headers bigger', 2],
      ['make the headings smaller', -2],
      ['increase the font size of all paragraphs by 4', 4],
      ['make the captions smaller by 1pt', -1],
    ])('relative sizes: %s', (message, step) => {
      const result = parseFormattingIntent(message)
      expect(result.style.fontSizeStep).toBe(step)
      expect(result.fontSize).toBeNull()
      expect(result.scope).toBe('all')
    })

    it('an absolute size wins over a relative word, and margins are not text', () => {
      expect(parseFormattingIntent('increase the heading font size to 14')).toMatchObject({ fontSize: 14, style: { fontSizeStep: null } })
      expect(parseFormattingIntent('make the margins bigger').style.fontSizeStep).toBeNull()
    })
  })

  it('names captions and tables without "all" or "the"', () => {
    expect(parseFormattingIntent('make figure captions italic')).toMatchObject({ targetCategory: 'captions', scope: 'all', formats: ['italic'] })
    expect(parseFormattingIntent('center tables')).toMatchObject({ targetCategory: 'tables', scope: 'all', formats: ['align_center'] })
  })

  it('still converts lists when the request asks for it', () => {
    expect(parseFormattingIntent('number the bullet points')).toMatchObject({ targetCategory: 'bulletLists', formats: ['ordered_list'] })
    expect(parseFormattingIntent('turn all the paragraphs into bullet points')).toMatchObject({ targetCategory: 'paragraphs', formats: ['unordered_list'] })
    expect(parseFormattingIntent('make this a bullet list')).toMatchObject({ targetCategory: 'all', scope: 'selection', formats: ['unordered_list'] })
    expect(parseFormattingIntent('make the table of contents bold').targetCategory).not.toBe('tables')
  })

  it('detects paragraph category requests', () => {
    const result = parseFormattingIntent('Justify all paragraphs')

    expect(result.scope).toBe('all')
    expect(result.targetCategory).toBe('paragraphs')
    expect(result.formats).toContain('align_justify')
  })

  it('handles "the rest" and "remaining" as bulk scope', () => {
    const rest = parseFormattingIntent('Bold the rest')
    const remaining = parseFormattingIntent('Format the remaining paragraphs')

    expect(rest.scope).toBe('all')
    expect(remaining.scope).toBe('all')
    expect(remaining.targetCategory).toBe('paragraphs')
  })

  it('keeps selection scope for a singular heading reference', () => {
    const result = parseFormattingIntent('Make this heading bold')

    expect(result.scope).toBe('selection')
    expect(result.targetCategory).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('extracts a quoted target and targets the whole document', () => {
    const result = parseFormattingIntent("remove the bold format of the 'approval sheet' text")

    expect(result.target).toBe('approval sheet')
    expect(result.scope).toBe('all')
    expect(result.normalize).toBe(true)
    expect(result.formats).toContain('bold')
  })

  it('extracts a double-quoted target', () => {
    const result = parseFormattingIntent('Make "List of Tables" bold')

    expect(result.target).toBe('list of tables')
    expect(result.scope).toBe('all')
  })

  it('extracts a phrase-prefixed target without swallowing command words', () => {
    const result = parseFormattingIntent('Format the text approval sheet bold')

    expect(result.target).toBe('approval sheet')
    expect(result.scope).toBe('all')
    expect(result.formats).toContain('bold')
  })

  it('does not treat a heading level as a target phrase', () => {
    const result = parseFormattingIntent('Make this heading 1')

    expect(result.target).toBeNull()
    expect(result.scope).toBe('selection')
  })

  it('does not treat a generic word after a heading prefix as a target', () => {
    const here = parseFormattingIntent('Use a minor heading here')
    const title = parseFormattingIntent('Make this title heading bold')
    const command = parseFormattingIntent('Change the heading to bold')
    const vague = parseFormattingIntent('Make the heading look better')

    expect(here.target).toBeNull()
    expect(title.target).toBeNull()
    expect(command.target).toBeNull()
    expect(vague.target).toBeNull()
  })

  it('extracts an explicitly marked phrase target', () => {
    const result = parseFormattingIntent('Make the title of the thesis bold')

    expect(result.target).toBe('thesis')
    expect(result.scope).toBe('all')
  })

  it('does not treat an apostrophe in a contraction as a quoted target', () => {
    const result = parseFormattingIntent("Don't change the formatting here")

    expect(result.target).toBeNull()
  })
})
describe('parseFormattingIntent target modes', () => {
  it('treats a quoted phrase as literal words', () => {
    const result = parseFormattingIntent('Change the "approval sheet" to bold')
    expect(result.target).toBe('approval sheet')
    expect(result.targetMode).toBe('literal')
  })

  it('treats an unquoted section name as its title line for title formatting', () => {
    const result = parseFormattingIntent('Change the approval sheet to bold')
    expect(result.target).toBe('approval sheet')
    expect(result.targetMode).toBe('heading')
  })

  it('treats a chapter reference as its title line for title formatting', () => {
    expect(parseFormattingIntent('make chapter two italic').targetMode).toBe('heading')
    expect(parseFormattingIntent('make chapter two italic').target).toBe('chapter 2')
  })

  it('covers the whole section when the request says so', () => {
    expect(parseFormattingIntent('make the entire chapter two italic').targetMode).toBe('section')
    expect(parseFormattingIntent('bold everything in the approval sheet').targetMode).toBe('section')
  })

  it('covers the whole section for body changes such as justify or line spacing', () => {
    expect(parseFormattingIntent('justify chapter 1').targetMode).toBe('section')
    expect(parseFormattingIntent('double space chapter 2').targetMode).toBe('section')
  })

  it('recognises "the title" as the document title', () => {
    const result = parseFormattingIntent('Center the title')
    expect(result.target).toBe('title')
    expect(result.targetMode).toBe('title')
    expect(result.formats).toContain('align_center')
  })

  it('keeps targetMode null when no target is named', () => {
    expect(parseFormattingIntent('make this bold').targetMode).toBeNull()
  })

  it('limits "all the chapter headings" to chapter headings', () => {
    const result = parseFormattingIntent('Make all the chapter headings 14pt')
    expect(result.targetCategory).toBe('chapters')
    expect(result.fontSize).toBe(14)
  })
})
