const uploadImportImages = jest.fn(async (_userId: string, html: string) => html.replace(/data:image\/png;base64,AAA/g, 'https://cdn/x.png'))
jest.mock('../uploadImportImages', () => ({ uploadImportImages: (...args: [string, string]) => uploadImportImages(...args) }))

import { buildImportedLayout } from '../buildImportedLayout'
import { pageLayoutSchema } from '../../../schemas/documentSchemas'
import type { PythonConversionResponse } from '../../../schemas/predictionSchemas'

const base: PythonConversionResponse = {
  html: '<p>x</p>',
  page_setup: { page_size: 'letter', orientation: 'portrait', margins: { top: 1, bottom: 1, left: 1, right: 1 } },
  header: '',
  footer: '',
}

const section = {
  index: 0, header: null, footer: null, first_header: null, first_footer: null, title_pg: false,
  number_start: null, number_format: 'decimal', header_distance: 48, footer_distance: 48,
}

describe('buildImportedLayout', () => {
  beforeEach(() => uploadImportImages.mockClear())

  it('keeps a plain document free of a page layout', async () => {
    const fields = await buildImportedLayout('u1', { ...base, hf: { sections: [section], parts: {} } })
    expect(fields.page_layout).toBeUndefined()
    expect(fields.show_header).toBe(false)
    expect(fields.page_size).toBe('letter')
  })

  it('stores art, parts and restarting numbers, with pictures moved to storage', async () => {
    const fields = await buildImportedLayout('u1', {
      ...base,
      hf: {
        sections: [{ ...section, header: 'p0' }, { ...section, index: 1, number_start: 1 }],
        parts: { p0: { flow: '<p>{page}</p>', art: '<img src="data:image/png;base64,AAA" />' } },
      },
      page_art: { repeat: '<img src="data:image/png;base64,AAA" />', pages: { '1': '<img src="data:image/png;base64,AAA" />' } },
    })
    expect(fields.page_layout?.parts.p0.art).toContain('https://cdn/x.png')
    expect(fields.page_layout?.repeat_art).toContain('https://cdn/x.png')
    expect(fields.page_layout?.page_art['1']).toContain('https://cdn/x.png')
    expect(fields.show_header).toBe(true)
    expect(pageLayoutSchema.safeParse(fields.page_layout).success).toBe(true)
  })

  it('keeps the layout, and says so, when the file is a two-column paper', async () => {
    const fields = await buildImportedLayout('u1', { ...base, two_column_body: true, hf: { sections: [section], parts: {} } })
    expect(fields.page_layout?.two_column).toBe(true)
    expect(pageLayoutSchema.safeParse(fields.page_layout).success).toBe(true)
    // The flag survives validation (an unknown key would be stripped).
    expect(pageLayoutSchema.parse(fields.page_layout).two_column).toBe(true)
  })

  it('keeps the layout when only the numbering restarts', async () => {
    const fields = await buildImportedLayout('u1', { ...base, hf: { sections: [section, { ...section, index: 1, number_start: 3 }], parts: {} } })
    expect(fields.page_layout?.sections).toHaveLength(2)
  })
})

describe('pageLayoutSchema', () => {
  it('rejects a layout over the size cap', () => {
    const huge = { sections: [], parts: {}, repeat_art: 'x'.repeat(2_100_000), page_art: {} }
    expect(pageLayoutSchema.safeParse(huge).success).toBe(false)
  })
})
