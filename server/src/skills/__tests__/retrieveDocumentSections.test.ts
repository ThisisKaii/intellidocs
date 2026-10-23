import { retrieveSections, splitIntoSections } from '../retrieveDocumentSections'

const HTML =
  '<p>UNIVERSITY OF CEBU</p><p>A Proposal Project</p>' +
  '<h1>CHAPTER I: INTRODUCTION</h1><p>This chapter introduces the problem of manual document formatting in schools.</p>' +
  '<h1>CHAPTER III: RESEARCH METHODOLOGY</h1><p>The study uses a design science research design with surveys of students and interviews with advisers.</p>' +
  '<p><strong>REFERENCES</strong></p><p>Smith, J. (2021). Deep Formatting.</p>'

describe('retrieveDocumentSections', () => {
  it('splits at headings and bold section titles, keeping the opening block', () => {
    const sections = splitIntoSections(HTML)
    expect(sections.map((s) => s.title)).toEqual([
      'Opening of the document',
      'CHAPTER I: INTRODUCTION',
      'CHAPTER III: RESEARCH METHODOLOGY',
      'REFERENCES',
    ])
    expect(sections[0].text).toContain('A Proposal Project')
  })

  it('finds the section that answers a question about a later chapter', () => {
    const picked = retrieveSections(splitIntoSections(HTML), 'What research design does the study use?')
    expect(picked.map((s) => s.title)).toContain('CHAPTER III: RESEARCH METHODOLOGY')
    expect(picked[0].title).not.toBe('REFERENCES')
  })

  it('resolves "chapter 3" to the roman-numeral chapter', () => {
    const picked = retrieveSections(splitIntoSections(HTML), 'Summarize chapter 3')
    expect(picked.map((s) => s.title)).toContain('CHAPTER III: RESEARCH METHODOLOGY')
  })

  it('maps a first-page question to the opening block', () => {
    const picked = retrieveSections(splitIntoSections(HTML), "What's on the first page?")
    expect(picked[0].title).toBe('Opening of the document')
  })

  it('falls back to the opening sections when nothing matches', () => {
    const picked = retrieveSections(splitIntoSections(HTML), 'zebra quantum')
    expect(picked.length).toBeGreaterThan(0)
    expect(picked[0].title).toBe('Opening of the document')
  })

  it('returns nothing for an empty document', () => {
    expect(retrieveSections(splitIntoSections(''), 'anything here')).toEqual([])
  })
})
