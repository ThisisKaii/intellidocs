const fetchWorkByDoi = jest.fn()
const searchWorkByTitle = jest.fn()
jest.mock('../../models/citationSourceModel', () => ({
  fetchWorkByDoi: (...args: unknown[]) => fetchWorkByDoi(...args),
  searchWorkByTitle: (...args: unknown[]) => searchWorkByTitle(...args),
}))

import { extractDoi, lookupCitation } from '../lookupCitation'

const WORK = {
  type: 'journal-article',
  title: ['Deep Formatting'],
  author: [{ given: 'Jane', family: 'Smith' }, { name: 'Open Lab' }],
  issued: { 'date-parts': [[2021]] },
  'container-title': ['Journal of Documents'],
  volume: '4',
  issue: '2',
  page: '10-20',
  DOI: '10.1000/xyz123',
  URL: 'https://doi.org/10.1000/xyz123',
}

describe('lookupCitation', () => {
  beforeEach(() => {
    fetchWorkByDoi.mockReset()
    searchWorkByTitle.mockReset()
  })

  it('finds a DOI inside a link and trims trailing punctuation', () => {
    expect(extractDoi('https://doi.org/10.1000/xyz123.')).toBe('10.1000/xyz123')
    expect(extractDoi('Deep formatting for documents')).toBeNull()
  })

  it('looks up by DOI and maps the work to a reference', async () => {
    fetchWorkByDoi.mockResolvedValue(WORK)
    const result = await lookupCitation('doi: 10.1000/xyz123')
    expect(fetchWorkByDoi).toHaveBeenCalledWith('10.1000/xyz123')
    expect(searchWorkByTitle).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      type: 'journal',
      authors: ['Jane Smith', 'Open Lab'],
      title: 'Deep Formatting',
      year: 2021,
      venue: 'Journal of Documents',
      pages: '10-20',
    })
  })

  it('searches by title when there is no DOI', async () => {
    searchWorkByTitle.mockResolvedValue(WORK)
    expect((await lookupCitation('Deep Formatting'))?.doi).toBe('10.1000/xyz123')
    expect(fetchWorkByDoi).not.toHaveBeenCalled()
  })

  it('returns null when nothing matches', async () => {
    fetchWorkByDoi.mockResolvedValue(null)
    expect(await lookupCitation('10.1000/missing')).toBeNull()
  })
})
