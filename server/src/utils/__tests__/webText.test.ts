import { documentParagraphs, pageText, pickQueryPhrases, sliceDocumentContent } from '../webText'

const SENTENCE_A = 'The quick brown fox jumps over the lazy dog while the farmer watches the river flow slowly past.'
const SENTENCE_B = 'Renewable energy adoption in coastal communities depends heavily on reliable funding and local training programs.'
const SENTENCE_C = 'Students who sleep well before examinations consistently perform better than those who study through the night.'

describe('documentParagraphs', () => {
  it('splits HTML blocks into plain paragraphs and decodes entities', () => {
    const html = '<h1>Title</h1><p>First &amp; second   paragraph.</p><ul><li>Item one</li></ul>'
    expect(documentParagraphs(html)).toEqual(['Title', 'First & second paragraph.', 'Item one'])
  })

  it('stops at the reference list so cited sources do not count as copying', () => {
    const html = '<p>Body text here.</p><h2>References</h2><p>Smith, J. (2020). A real paper.</p>'
    expect(documentParagraphs(html)).toEqual(['Body text here.'])
  })

  it('also stops at a numbered bibliography heading', () => {
    expect(documentParagraphs('<p>Body.</p><p>5. Bibliography</p><p>Entry</p>')).toEqual(['Body.'])
  })

  it('skips front-matter sections (approval sheet, dedication, TOC, list of figures) and resumes at body headings', () => {
    const html = `
      <h1>Intelligent Document System</h1>
      <p>A Capstone Project Submitted in Partial Fulfillment of the Requirements for the Degree of Bachelor of Science in Information Technology</p>
      <h2>Approval Sheet</h2>
      <p>This is to certify that the project has been approved by the panel.</p>
      <h2>Dedication</h2>
      <p>Dedicated to our supportive parents and professors.</p>
      <h2>Acknowledgments</h2>
      <p>We thank everyone who supported this capstone research.</p>
      <h2>Table of Contents</h2>
      <p>Chapter 1 Introduction .................... 1</p>
      <p>Chapter 2 Review of Related Literature .... 15</p>
      <h2>List of Figures</h2>
      <p>Figure 1: Architectural diagram ........... 8</p>
      <h2>Chapter 1: Introduction</h2>
      <p>Modern web-based editing platforms rarely incorporate behavioral formatting models.</p>
      <h2>References</h2>
      <p>Doe, J. (2024). Text analysis.</p>
    `
    expect(documentParagraphs(html)).toEqual([
      'Intelligent Document System',
      'Chapter 1: Introduction',
      'Modern web-based editing platforms rarely incorporate behavioral formatting models.',
    ])
  })

  it('skips storyboard descriptions, screen specifications, figure/table captions, and code lines', () => {
    const html = `
      <h2>System Architecture</h2>
      <p>Figure 1: High-level architectural flowchart of the application.</p>
      <p>Storyboard 1: User Login</p>
      <p>Screen Description: Allows the user to enter their registered email address and password.</p>
      <p>Screen Name: Authentication Screen</p>
      <p>Actor: Student Author</p>
      <p>Precondition: User is registered in the database.</p>
      <p>const auth = getAuthToken();</p>
      <p>The system verifies cryptographic tokens to protect sensitive documents from unauthorized access.</p>
    `
    expect(documentParagraphs(html)).toEqual([
      'System Architecture',
      'The system verifies cryptographic tokens to protect sensitive documents from unauthorized access.',
    ])
  })
})

describe('pageText', () => {
  it('drops scripts, styles and page furniture and keeps the article text', () => {
    const html = '<nav>Home About</nav><script>var x = "secret"</script><style>p{}</style><article><p>Real article text.</p></article><footer>Copyright</footer>'
    const text = pageText(html)
    expect(text).toContain('Real article text.')
    expect(text).not.toMatch(/secret|Home About|Copyright/)
  })
})

describe('pickQueryPhrases', () => {
  it('picks phrases spread through the document, without the sentence opener', () => {
    const phrases = pickQueryPhrases([SENTENCE_A, SENTENCE_B, SENTENCE_C], 3, 8)
    expect(phrases).toHaveLength(3)
    expect(phrases[0]).toBe('brown fox jumps over the lazy dog while')
    expect(phrases.every((phrase) => phrase.split(' ').length === 8)).toBe(true)
  })

  it('returns fewer phrases when the document has fewer usable sentences', () => {
    expect(pickQueryPhrases([SENTENCE_A], 8, 8)).toHaveLength(1)
  })

  it('skips short lines, links, emails, captions and number-heavy lines', () => {
    const poor = [
      'Too short to search.',
      'See https://example.com/some/very/long/path for the full details on this particular topic today.',
      'Contact the registrar at registrar@school.edu for the full details on this particular topic today.',
      'Figure 3 shows the distribution of the responses across every barangay in the municipality surveyed.',
      'In 2019 the 1,245 respondents from 37 schools gave 4,502 answers across 18 categories in 2020 and 2021.',
      'Storyboard 2: The screen displays the user settings panel and profile avatar image.',
      'Screen Description: The user clicks the button to open the modal dialog box.',
      'A capstone project presented to the faculty of the college in partial fulfillment of the requirements.',
    ]
    expect(pickQueryPhrases(poor, 5, 8)).toEqual([])
  })

  it('strips quotation marks that would break an exact-phrase query', () => {
    const phrases = pickQueryPhrases(['He said “the quick brown fox jumps over the lazy dog” and then left the room quietly.'], 1, 8)
    expect(phrases[0]).not.toMatch(/[“”"]/)
  })
})

describe('sliceDocumentContent', () => {
  const sampleDoc = `
    <h1>Chapter 1: Introduction</h1>
    <p>Introduction body text here.</p>
    <h1>Chapter 2: Review of Related Literature</h1>
    <p>Literature review body text with citations.</p>
    <h1>Chapter 3: Methodology</h1>
    <p>Methodology body text.</p>
  `

  it('slices content by specific chapter heading', () => {
    const sliced = sliceDocumentContent(sampleDoc, {
      scope: 'chapter',
      chapterTitle: 'Chapter 2: Review of Related Literature',
    })
    expect(sliced).toContain('Chapter 2: Review of Related Literature')
    expect(sliced).toContain('Literature review body text with citations.')
    expect(sliced).not.toContain('Chapter 1: Introduction')
    expect(sliced).not.toContain('Chapter 3: Methodology')
  })

  it('slices content by explicit page breaks', () => {
    const pagedDoc = `
      <p>Page 1 content.</p>
      <div class="intellidocs-page-break"></div>
      <p>Page 2 content.</p>
      <div class="intellidocs-page-break"></div>
      <p>Page 3 content.</p>
    `
    const page2 = sliceDocumentContent(pagedDoc, { scope: 'pages', pageStart: 2, pageEnd: 2 })
    expect(page2).toContain('Page 2 content.')
    expect(page2).not.toContain('Page 1 content.')
    expect(page2).not.toContain('Page 3 content.')
  })

  it('returns full content when scope is all', () => {
    expect(sliceDocumentContent(sampleDoc, { scope: 'all' })).toBe(sampleDoc)
  })
})
