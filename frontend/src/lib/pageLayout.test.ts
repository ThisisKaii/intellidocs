import { describe, expect, it } from 'vitest'
import {
  lastLineSlackPx,
  layoutSectionFromProps,
  mergeLayoutSections,
  numberingCss,
  pageZones,
  sectionForPage,
  type PageLayoutData,
  type PageLayoutSection,
} from './pageLayout'
import { SAMPLE_SECTION } from './sectionProps.fixture'
import { sanitizeHeaderHtml } from './sanitizeHeaderHtml'

const section = (index: number, patch: Partial<PageLayoutSection> = {}): PageLayoutSection => ({
  index, header: null, footer: null, first_header: null, first_footer: null, title_pg: false,
  number_start: null, number_format: 'decimal', header_distance: 48, footer_distance: 48, ...patch,
})

const layout: PageLayoutData = {
  sections: [
    section(0, { header: 'a', title_pg: true, number_format: 'lowerRoman' }),
    section(1, { header: 'b', number_start: 1 }),
  ],
  parts: { a: { flow: '<p>{page}</p>', art: '' }, b: { flow: '<p>Chapter {page}</p>', art: '<img src="https://x/y.png" />' } },
  repeat_art: '<img src="https://x/run.png" />',
  page_art: { '3': '<img src="https://x/three.png" />' },
}
const measure = { starts: [{ section: 1, page: 4 }], pageCount: 9 }

describe('sectionForPage', () => {
  it('uses the last section that started on or before the page', () => {
    expect(sectionForPage(layout, measure, 3)?.section.index).toBe(0)
    expect(sectionForPage(layout, measure, 4)?.section.index).toBe(1)
    expect(sectionForPage(layout, measure, 9)?.start).toBe(4)
  })
})

describe('pageZones', () => {
  it('skips the header on a different first page and adds running and per-page art', () => {
    expect(pageZones(layout, measure, 1).header).toContain('run.png')
    expect(pageZones(layout, measure, 1).header).not.toContain('{page}')
    expect(pageZones(layout, measure, 2).header).toContain('{page}')
    expect(pageZones(layout, measure, 3).header).toContain('three.png')
    expect(pageZones(layout, measure, 5).header).toContain('Chapter {page}')
  })
  it('draws footer art from the page-sized box in the header zone, where its page-corner position holds', () => {
    const withFooterArt: PageLayoutData = {
      ...layout,
      sections: [section(0, { footer: 'f' })],
      parts: { f: { flow: '<p>Foot</p>', art: '<img src="https://x/rule.png" />' } },
    }
    const zones = pageZones(withFooterArt, { starts: [], pageCount: 1 }, 1)
    expect(zones.header).toContain('rule.png')
    expect(zones.footer).not.toContain('rule.png')
    expect(zones.footer).toContain('Foot')
  })
})

describe('lastLineSlackPx', () => {
  it('gives only imported Word documents the room for a last line', () => {
    expect(lastLineSlackPx({ ...layout, flow_rules: true })).toBe(3)
    expect(lastLineSlackPx(layout)).toBe(9) // widow control off in the file
    expect(lastLineSlackPx({ ...layout, flow_rules: false })).toBe(0)
    expect(lastLineSlackPx(null)).toBe(0)
  })
})

describe('numberingCss', () => {
  const css = numberingCss(layout, measure)
  it('restarts the counters in the breaks that draw the section start page', () => {
    expect(css).toContain('.rm-page-break:nth-child(3) { counter-set: page-number-plus 1; }')
    expect(css).toContain('.rm-page-break:nth-child(4) { counter-set: page-number 1; }')
  })
  it('never restarts a later section with counter-reset, which the next page would not inherit', () => {
    expect(css).not.toMatch(/nth-child\(\d+\) \{ counter-reset/)
  })
  it('starts the first section from the root, so the pages after the first follow it', () => {
    const fromFive = numberingCss({ ...layout, sections: [section(0, { number_start: 5 })] }, { starts: [], pageCount: 3 })
    expect(fromFive).toContain('.rm-with-pagination.rm-with-pagination, .rm-with-pagination .rm-first-page-header { counter-reset: page-number page-number-plus 5; }')
    expect(fromFive).toContain('.rm-page-break:nth-child(1) { counter-set: page-number 5; }')
  })
  it('formats the first section in roman numerals up to the page before the next section', () => {
    expect(css).toContain('counter(page-number, lower-roman)')
    expect(css).toContain('nth-child(n+1):nth-child(-n+2) .rm-page-number-plus')
  })
})

describe('sanitizeHeaderHtml', () => {
  it('drops scripts, handlers, javascript urls and foreign image sources, and keeps safe art', () => {
    const dirty =
      '<div onclick="x()"><script>alert(1)</script><img src="javascript:1"><img src="https://x/a.png" style="position:absolute;left:3px;background:url(//evil)" onerror="x()">{page}</div>'
    const clean = sanitizeHeaderHtml(dirty)
    expect(clean).not.toMatch(/script|onclick|onerror|javascript|evil/)
    expect(clean).toContain('https://x/a.png')
    expect(clean).toContain('position:absolute')
    expect(clean).toContain('{page}')
  })
})

describe('pictures in a header or footer text flow', () => {
  const tall: PageLayoutData = {
    sections: [section(0, { header: 'h', footer: 'f', header_distance: 48, footer_distance: 36 })],
    parts: {
      h: { flow: '<p><img src="https://x/logo.png" style="width:192px" /></p>', art: '<img src="https://x/bg.png" />' },
      f: { flow: '<p><img src="https://x/banner.png" /></p>', art: '' },
    },
    repeat_art: '',
    page_art: {},
  }

  it('caps them to the room inside the margin and leaves full-page art alone', () => {
    const zones = pageZones(tall, { starts: [], pageCount: 1 }, 1)
    const header = sanitizeHeaderHtml(zones.header)
    expect(header).toContain('max-height:max(24px,calc(var(--rm-margin-top) - 48px))')
    expect(header).toContain('object-fit:contain')
    expect(header).toContain('width:192px')
    expect(header.match(/max-height/g)).toHaveLength(1) // the art image is not capped
    expect(sanitizeHeaderHtml(zones.footer)).toContain('calc(var(--rm-margin-bottom) - 36px)')
  })
})

describe('sections from the document', () => {
  const stored = (index: number, footer: string | null): PageLayoutSection => ({
    index, header: null, footer, first_header: null, first_footer: null, title_pg: false,
    number_start: null, number_format: 'decimal', header_distance: 48, footer_distance: 48,
  })

  it('reads the header, footer and numbering of a section from the properties on its break', () => {
    expect(layoutSectionFromProps(3, SAMPLE_SECTION)).toEqual({
      index: 3, header: null, footer: 'footer3', first_header: null, first_footer: null, title_pg: false,
      number_start: 1, number_format: 'lowerRoman', header_distance: 0, footer_distance: 48,
    })
  })

  it('lets the document win section by section and keeps stored sections it does not describe', () => {
    const merged = mergeLayoutSections([stored(0, 'a'), stored(1, 'b')], [{ section: 1, props: SAMPLE_SECTION }])
    expect(merged.map((s) => [s.index, s.footer])).toEqual([[0, 'a'], [1, 'footer3']])
  })

  it('adds sections only the document has, in order', () => {
    const merged = mergeLayoutSections([stored(0, 'a')], [{ section: 2, props: SAMPLE_SECTION }])
    expect(merged.map((s) => s.index)).toEqual([0, 2])
  })

  it('keeps the stored list for documents whose breaks carry no properties', () => {
    const list = [stored(0, 'a'), stored(1, 'b')]
    expect(mergeLayoutSections(list, [{ section: 1, props: null }])).toBe(list)
    expect(mergeLayoutSections(list, [])).toBe(list)
  })
})
