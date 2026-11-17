const getDocumentById = jest.fn()
const listTabs = jest.fn()
const getTab = jest.fn()
jest.mock('../../models/documentModel', () => ({ getDocumentById: (...args: unknown[]) => getDocumentById(...args) }))
jest.mock('../../models/documentTabModel', () => ({
  listTabs: (...args: unknown[]) => listTabs(...args),
  getTab: (...args: unknown[]) => getTab(...args),
}))

import { buildPresetFromDocument } from '../buildPresetFromDocument'

const heading = (level: number, text: string, style: string) => ({
  type: 'heading',
  attrs: { level, textAlign: 'center', style },
  content: [{ type: 'text', text }],
})
const body = (text: string) => ({
  type: 'paragraph',
  attrs: { textAlign: 'justify', style: 'font-family:Times New Roman;font-size:10pt' },
  content: [{ type: 'text', text, marks: [{ type: 'textStyle', attrs: { fontFamily: 'Times New Roman', fontSize: '10pt' } }] }],
})
const SENTENCE = 'This sentence is long enough to count as body text in a paper for the blueprint reader. '.repeat(3)

beforeEach(() => jest.clearAllMocks())

describe('buildPresetFromDocument', () => {
  it("reads a document's page setup and headings", async () => {
    getDocumentById.mockResolvedValue({
      id: 'd1',
      content: '<p>…</p>',
      content_json: { type: 'doc', content: [heading(1, 'INTRODUCTION', 'font-size:12pt'), body(SENTENCE), body(SENTENCE)] },
      page_size: 'letter',
      orientation: 'portrait',
      margins: { top: 0.75, bottom: 1, left: 0.625, right: 0.625 },
      header_number_format: 'none',
      footer_number_format: 'arabic',
    })
    const blueprint = await buildPresetFromDocument('u1', 'd1')
    expect(getDocumentById).toHaveBeenCalledWith('d1', 'u1')
    expect(blueprint).toMatchObject({ pageSize: 'letter', margins: { top: 0.75, left: 0.63 } })
  })

  it('reads a tabbed document from its first tabs', async () => {
    getDocumentById.mockResolvedValue({
      id: 'd2',
      content: '<div data-tab-break="" data-tab-id="t1" data-title="Chapter 1"></div>',
      content_json: null,
      page_size: 'a4',
      orientation: 'portrait',
      margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
    })
    listTabs.mockResolvedValue([{ tab_id: 't1' }])
    getTab.mockResolvedValue({ content_json: { type: 'doc', content: [heading(1, 'CHAPTER I', 'font-size:12pt'), body(SENTENCE), body(SENTENCE)] } })
    const blueprint = await buildPresetFromDocument('u1', 'd2')
    expect(getTab).toHaveBeenCalledWith('d2', 't1')
    expect(blueprint).toMatchObject({ pageSize: 'a4', margins: { left: 1.5 } })
  })

  it('gives nothing to read from a document without editor JSON', async () => {
    getDocumentById.mockResolvedValue({ id: 'd3', content: '<p>old</p>', content_json: null })
    expect(await buildPresetFromDocument('u1', 'd3')).toBeNull()
  })
})
