import { documentHasTarget, listOutlineSections, normalizeSectionKey } from '../documentSections'
import { buildChatContext } from '../buildChatContext'

const CONTENT = 'APPROVAL SHEET This capstone project...\n\nDocument outline:\n- APPROVAL SHEET\n- DEDICATION\n- TABLE OF CONTENTS\n- CHAPTER III: RESEARCH METHODOLOGY\n\nWord count: 900'

describe('document sections', () => {
  it('reads every outline line', () => {
    expect(listOutlineSections(CONTENT)).toEqual(['APPROVAL SHEET', 'DEDICATION', 'TABLE OF CONTENTS', 'CHAPTER III: RESEARCH METHODOLOGY'])
  })

  it('finds sections that are only in the outline', () => {
    expect(documentHasTarget(CONTENT, 'dedication', 'section')).toBe(true)
    expect(documentHasTarget(CONTENT, 'table of contents', 'section')).toBe(true)
    expect(documentHasTarget(CONTENT, 'glossary', 'section')).toBe(false)
  })

  it('matches roman and arabic chapter numbers', () => {
    expect(normalizeSectionKey('CHAPTER III')).toBe('chapter 3')
    expect(documentHasTarget(CONTENT, 'chapter 3', 'section')).toBe(true)
  })

  it('always has a title', () => {
    expect(documentHasTarget('', 'title', 'title')).toBe(true)
  })

  it('puts the whole outline into the chat context', () => {
    const context = buildChatContext({ documentTitle: 'QA', documentContent: CONTENT })
    expect(context).toContain('"DEDICATION"')
    expect(context).toContain('"TABLE OF CONTENTS"')
  })
})
