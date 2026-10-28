import { runWebOriginalityCheck } from '../runWebOriginalityCheck'
import type { SearchProvider, SourceCandidate } from '../../models/webSourceModel'

const COPIED =
  'Climate change is increasingly affecting coastal communities around the world, forcing governments to invest in sea walls, early warning systems and managed retreat programs.'
const OWN_1 = 'My thesis examines how small coffee farmers in the highlands decide which crops to plant after each harvest season ends and why.'
const OWN_2 = 'Interviews with thirty households revealed that rainfall predictions from the local radio station shaped almost every planting decision they made.'
const DOCUMENT = [OWN_1, COPIED, OWN_2, OWN_1.replace('coffee', 'cacao')].map((text) => `<p>${text}</p>`).join('')

const SOURCE_TEXT = `Intro text that is not related. ${COPIED} Closing remarks that are also not related to the document at all, padded to be long enough.`

/** A provider that answers every search with the given candidates. */
function provider(overrides: Partial<SearchProvider> & { candidates?: SourceCandidate[] } = {}): SearchProvider {
  const { candidates = [], ...rest } = overrides
  return {
    name: 'Test source',
    kind: 'wikipedia',
    isConfigured: () => true,
    search: async () => candidates,
    ...rest,
  }
}

describe('runWebOriginalityCheck', () => {
  it('finds a copied paragraph in a source that came with its text', async () => {
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [provider({ candidates: [{ url: 'https://a.test/1', title: 'Source 1', kind: 'wikipedia', text: SOURCE_TEXT }] })],
    })
    expect(result.passages).toHaveLength(1)
    expect(result.passages[0]).toMatchObject({ source_url: 'https://a.test/1', match_type: 'verbatim' })
    expect(result.overlap_percent).toBeGreaterThan(10)
    expect(result.sources).toEqual([{ url: 'https://a.test/1', title: 'Source 1', kind: 'wikipedia', matched: true }])
    expect(result.providers).toEqual([{ name: 'Test source', kind: 'wikipedia', status: 'searched' }])
    expect(result.queries).toBeGreaterThan(0)
  })

  it('downloads the text of sources that need it', async () => {
    const loadText = jest.fn(async () => SOURCE_TEXT)
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [provider({ kind: 'web', candidates: [{ url: 'https://b.test/page', title: 'Page', kind: 'web' }], loadText })],
    })
    expect(loadText).toHaveBeenCalledTimes(1)
    expect(result.passages[0].source_kind).toBe('web')
  })

  it('reports providers that are not configured and does not call them', async () => {
    const search = jest.fn(async () => [])
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [provider({ name: 'Keyed', isConfigured: () => false, search }), provider()],
    })
    expect(search).not.toHaveBeenCalled()
    expect(result.providers.map((p) => [p.name, p.status])).toEqual([['Keyed', 'not_configured'], ['Test source', 'searched']])
  })

  it('reports a provider that fails every search and still uses the others', async () => {
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [
        provider({ name: 'Broken', search: async () => { throw new Error('broken.test answered 429') } }),
        provider({ candidates: [{ url: 'https://a.test/1', title: 'S', kind: 'wikipedia', text: SOURCE_TEXT }] }),
      ],
    })
    expect(result.providers[0]).toMatchObject({ name: 'Broken', status: 'failed', message: 'broken.test answered 429' })
    expect(result.passages).toHaveLength(1)
    expect(result.note).toBeUndefined()
  })

  it('says so when no search service could be reached', async () => {
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [provider({ search: async () => { throw new Error('down') } })],
    })
    expect(result.note).toMatch(/could be reached/)
    expect(result.overlap_percent).toBe(0)
  })

  it('does not count a source whose download failed or that is too short', async () => {
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [
        provider({
          kind: 'web',
          candidates: [
            { url: 'https://c.test/fail', title: 'Fails', kind: 'web' },
            { url: 'https://c.test/short', title: 'Short', kind: 'web', text: 'tiny' },
          ],
          loadText: async () => { throw new Error('timeout') },
        }),
      ],
    })
    expect(result.sources).toEqual([])
    expect(result.passages).toEqual([])
  })

  it('compares at most 12 sources, keeping the ones found most often', async () => {
    const many: SourceCandidate[] = Array.from({ length: 20 }, (_, i) => ({ url: `https://m.test/${i}`, title: `S${i}`, kind: 'wikipedia' as const, text: `${SOURCE_TEXT} ${i}`.padEnd(300, ' filler') }))
    const result = await runWebOriginalityCheck({ documentHtml: DOCUMENT, providers: [provider({ candidates: many })] })
    expect(result.sources).toHaveLength(12)
  })

  it('stops searching when the time budget is spent', async () => {
    let clock = 0
    const search = jest.fn(async () => { clock += 40000; return [] })
    const result = await runWebOriginalityCheck({
      documentHtml: DOCUMENT,
      providers: [provider({ search })],
      now: () => clock,
      timeBudgetMs: 50000,
    })
    expect(search.mock.calls.length).toBeLessThan(result.queries)
    expect(result.truncated).toBe(true)
  })

  it('explains when the document is too short or has nothing to search for', async () => {
    const short = await runWebOriginalityCheck({ documentHtml: '<p>Just a few words.</p>', providers: [provider()] })
    expect(short.note).toMatch(/too short/)
    const noSentences = await runWebOriginalityCheck({ documentHtml: `<p>${'Go now. '.repeat(20)}</p>`, providers: [provider()] })
    expect(noSentences.note).toMatch(/no long sentences/)
  })
})
