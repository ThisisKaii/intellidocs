const searchWorks = jest.fn()
const searchSemanticScholar = jest.fn()
jest.mock('../../models/citationSourceModel', () => ({
  searchWorks: (...args: unknown[]) => searchWorks(...args),
  searchSemanticScholar: (...args: unknown[]) => searchSemanticScholar(...args),
  fetchWorkByDoi: jest.fn(),
  searchWorkByTitle: jest.fn(),
}))

import { groundLiteratureCitations, keywordsOf } from '../groundLiteratureCitations'

const CROSSREF_ATTENTION = {
  type: 'proceedings-article',
  title: ['Attention Is All You Need'],
  author: [{ given: 'Ashish', family: 'Vaswani' }],
  issued: { 'date-parts': [[2017]] },
  'container-title': ['Advances in Neural Information Processing Systems'],
  DOI: '10.5555/3295222.3295349',
  'is-referenced-by-count': 900,
}

const S2_ATTENTION_DUPLICATE = {
  title: 'Attention is all you need',
  authors: [{ name: 'Ashish Vaswani' }],
  year: 2017,
  abstract: 'The dominant sequence transduction models are based on complex recurrent networks with attention mechanisms.',
  citationCount: 100000,
  externalIds: { DOI: '10.5555/3295222.3295349' },
  publicationTypes: ['Conference'],
}

const S2_OTHER = {
  title: 'Transformers for vision with attention',
  authors: [{ name: 'Alexey Dosovitskiy' }],
  year: 2021,
  citationCount: 50,
  externalIds: {},
  publicationTypes: ['JournalArticle'],
}

const S2_UNRELATED = { title: 'Soil chemistry in wetlands', authors: [{ name: 'A B' }], year: 2010, citationCount: 3000 }

describe('groundLiteratureCitations', () => {
  beforeEach(() => {
    searchWorks.mockReset()
    searchSemanticScholar.mockReset()
  })

  it('searches on content words only', () => {
    expect(keywordsOf('Find 3 recent papers about the attention mechanisms in transformers')).toEqual(['attention', 'mechanisms', 'transformers'])
  })

  it('merges duplicates across indexes, drops unrelated hits and ranks by relevance', async () => {
    searchWorks.mockResolvedValue([CROSSREF_ATTENTION])
    searchSemanticScholar.mockResolvedValue([S2_ATTENTION_DUPLICATE, S2_OTHER, S2_UNRELATED])
    const papers = await groundLiteratureCitations({ query: 'attention mechanisms in transformers', limit: 3 })
    expect(searchWorks).toHaveBeenCalledWith('attention mechanisms transformers', 6)
    expect(papers.map((paper) => paper.title)).toEqual(['Attention Is All You Need', 'Transformers for vision with attention'])
    expect(papers[0]).toMatchObject({ source: 'crossref', doi: '10.5555/3295222.3295349', year: 2017, citationCount: 100000 })
    expect(papers[0].abstract).toContain('attention mechanisms')
  })

  it('answers from one index when the other fails', async () => {
    searchWorks.mockResolvedValue([])
    searchSemanticScholar.mockResolvedValue([S2_OTHER])
    const papers = await groundLiteratureCitations({ query: 'vision transformers' })
    expect(papers).toHaveLength(1)
    expect(papers[0]).toMatchObject({ source: 'semanticscholar', type: 'journal', authors: ['Alexey Dosovitskiy'] })
  })

  it('does not search for an empty query', async () => {
    expect(await groundLiteratureCitations({ query: 'find some papers' })).toEqual([])
    expect(searchWorks).not.toHaveBeenCalled()
  })
})
