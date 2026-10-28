import {
  abstractFromInvertedIndex,
  getSearchProviders,
  parseArxivFeed,
  parseBraveResults,
  parseDuckDuckGoResults,
  parseOpenAlexWorks,
  parseWikipediaExtract,
  parseWikipediaSearch,
} from '../webSourceModel'

describe('parsers', () => {
  it('reads Wikipedia search titles and the page extract', () => {
    expect(parseWikipediaSearch({ query: { search: [{ title: 'Climate change' }, { title: 'Sea level rise' }] } })).toEqual(['Climate change', 'Sea level rise'])
    expect(parseWikipediaSearch({})).toEqual([])
    expect(parseWikipediaExtract({ query: { pages: { 123: { extract: 'Full text.' } } } })).toBe('Full text.')
    expect(parseWikipediaExtract({ query: { pages: { '-1': {} } } })).toBeNull()
  })

  it('reads papers from an arXiv Atom feed and decodes entities', () => {
    const xml = `<feed><entry><id>http://arxiv.org/abs/1234.5678v1</id><title>Learning &amp; Teaching\n  Together</title><summary>  An abstract
      with   breaks &lt;b&gt;.</summary></entry><entry><id>http://arxiv.org/abs/9</id><title>No summary</title></entry></feed>`
    expect(parseArxivFeed(xml)).toEqual([
      { url: 'http://arxiv.org/abs/1234.5678v1', title: 'Learning & Teaching Together', kind: 'arxiv', text: 'An abstract with breaks <b>.' },
    ])
  })

  it('rebuilds an OpenAlex abstract from its word-position index', () => {
    expect(abstractFromInvertedIndex({ world: [1], Hello: [0], again: [2, 3] })).toBe('Hello world again again')
    expect(abstractFromInvertedIndex(null)).toBe('')
  })

  it('reads OpenAlex works, preferring the DOI link and skipping works without abstracts', () => {
    const works = parseOpenAlexWorks({
      results: [
        { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1/x', title: 'A', abstract_inverted_index: { Some: [0], text: [1] } },
        { id: 'https://openalex.org/W2', title: 'B', abstract_inverted_index: null },
      ],
    })
    expect(works).toEqual([{ url: 'https://doi.org/10.1/x', title: 'A', kind: 'openalex', text: 'Some text' }])
  })

  it('reads Brave web results', () => {
    expect(parseBraveResults({ web: { results: [{ url: 'https://a.test/x', title: 'A' }, { title: 'no url' }] } })).toEqual([
      { url: 'https://a.test/x', title: 'A', kind: 'web' },
    ])
    expect(parseBraveResults({})).toEqual([])
  })

  it('reads DuckDuckGo HTML results', () => {
    const html = `<h2 class="result__title"><a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example <b>Title</b></a></h2>`
    expect(parseDuckDuckGoResults(html)).toEqual([
      { url: 'https://example.com/page', title: 'Example Title', kind: 'web' },
    ])
    expect(parseDuckDuckGoResults('')).toEqual([])
  })
})

describe('getSearchProviders', () => {
  it('provides keyless sources by default and switches web to Brave when configured', () => {
    const bare = getSearchProviders({})
    expect(bare.map((p) => [p.name, p.isConfigured()])).toEqual([
      ['Wikipedia', true],
      ['arXiv', true],
      ['OpenAlex', true],
      ['Web (DuckDuckGo)', true],
    ])
    const keyed = getSearchProviders({ BRAVE_SEARCH_API_KEY: 'k2' })
    expect(keyed.map((p) => [p.name, p.isConfigured()])).toEqual([
      ['Wikipedia', true],
      ['arXiv', true],
      ['OpenAlex', true],
      ['Web (Brave Search)', true],
    ])
  })
})
