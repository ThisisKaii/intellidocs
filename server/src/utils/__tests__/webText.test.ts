import { documentParagraphs, pageText, pickQueryPhrases } from '../webText'

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
    ]
    expect(pickQueryPhrases(poor, 5, 8)).toEqual([])
  })

  it('strips quotation marks that would break an exact-phrase query', () => {
    const phrases = pickQueryPhrases(['He said “the quick brown fox jumps over the lazy dog” and then left the room quietly.'], 1, 8)
    expect(phrases[0]).not.toMatch(/[“”"]/)
  })
})
