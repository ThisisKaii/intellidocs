import { comparePassages, type ComparisonSource } from '../shingleMatch'

const COPIED =
  'Climate change is increasingly affecting coastal communities around the world, forcing governments to invest in sea walls, early warning systems and managed retreat programs.'

const WIKI: ComparisonSource = {
  url: 'https://en.wikipedia.org/wiki/Climate_change',
  title: 'Climate change',
  kind: 'wikipedia',
  text: `Introduction paragraph about the topic. ${COPIED} More unrelated text follows here about other matters entirely.`,
}

const UNRELATED: ComparisonSource = {
  url: 'https://example.com/cooking',
  title: 'Cooking',
  kind: 'web',
  text: 'Mix flour and water, knead the dough for ten minutes, let it rest overnight, then bake in a very hot oven until golden brown on top.',
}

describe('comparePassages', () => {
  it('reports a copied paragraph with its source and the matching text as written there', () => {
    const result = comparePassages([COPIED], [UNRELATED, WIKI])
    expect(result.passages).toHaveLength(1)
    const passage = result.passages[0]
    expect(passage.match_type).toBe('verbatim')
    expect(passage.similarity).toBeGreaterThan(95)
    expect(passage.source_url).toBe(WIKI.url)
    expect(passage.source_excerpt).toContain('coastal communities around the world')
    expect(result.matchedUrls).toEqual([WIKI.url])
    expect(result.overlap_percent).toBeGreaterThan(95)
  })

  it('finds a copied passage inside a longer paragraph of original writing', () => {
    const original = 'In my own opinion after many months of careful reading and discussion with my adviser and classmates about this subject. '
    const paragraph = `${original}${COPIED}`
    const result = comparePassages([paragraph], [WIKI])
    expect(result.passages).toHaveLength(1)
    expect(result.passages[0].match_type).toBe('partial')
    expect(result.passages[0].similarity).toBeGreaterThan(30)
    expect(result.passages[0].similarity).toBeLessThan(80)
  })

  it('ignores case, punctuation and spacing differences when matching', () => {
    const result = comparePassages([COPIED.toUpperCase().replace(/,/g, ' ,  ')], [WIKI])
    expect(result.passages).toHaveLength(1)
  })

  it('reports nothing for original writing', () => {
    const own = 'My thesis examines how small coffee farmers in the highlands decide which crops to plant after each harvest season ends.'
    const result = comparePassages([own], [WIKI, UNRELATED])
    expect(result).toEqual({ overlap_percent: 0, passages: [], matchedUrls: [] })
  })

  it('ignores a few shared common phrases', () => {
    const own = 'It is important to note that, in the case of the study, climate change is increasingly affecting how my chosen village plans its yearly harvest.'
    expect(comparePassages([own], [WIKI]).passages).toEqual([])
  })

  it('skips paragraphs too short to compare', () => {
    expect(comparePassages(['Climate change is increasingly affecting'], [WIKI]).passages).toEqual([])
  })

  it('weighs the overlap by how much of the document is shared', () => {
    const own = 'My thesis examines how small coffee farmers in the highlands decide which crops to plant after each harvest season ends, and why.'
    const result = comparePassages([COPIED, own], [WIKI])
    expect(result.overlap_percent).toBeGreaterThan(40)
    expect(result.overlap_percent).toBeLessThan(60)
    expect(result.passages.map((p) => p.paragraph_index)).toEqual([0])
  })

  it('picks the source that shares the most of the paragraph', () => {
    const partial: ComparisonSource = { ...UNRELATED, url: 'https://example.com/partial', text: `Some lead in text. ${COPIED.slice(0, 80)} and then it ends.` }
    const result = comparePassages([COPIED], [partial, WIKI])
    expect(result.passages[0].source_url).toBe(WIKI.url)
  })
})
