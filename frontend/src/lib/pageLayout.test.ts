import { describe, expect, it } from 'vitest'
import {
  lastLineSlackPx,
  layoutSectionFromProps,
  mergeLayoutSections,
  numberingCss,
  pageZones,
  placeZoneFlow,
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

describe('header push', () => {
  it("gives the pages of a section whose header runs past the margin a spacer that survives sanitizing", () => {
    const pushed: PageLayoutData = { ...layout, sections: [section(0), section(1, { header_push: 29.1 })] }
    expect(pageZones(pushed, measure, 2).header).not.toContain('data-header-push')
    const header = sanitizeHeaderHtml(pageZones(pushed, measure, 5).header)
    expect(header).toContain('data-header-push')
    expect(header).toContain('height:29.1px')
  })
  it('is read from the section break, and left out when the header fits', () => {
    const props = { ...SAMPLE_SECTION, margins: { ...SAMPLE_SECTION.margins, headerPush: 29.1 } }
    expect(layoutSectionFromProps(3, props).header_push).toBe(29.1)
    expect(layoutSectionFromProps(3, SAMPLE_SECTION).header_push).toBeUndefined()
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

describe('placeZoneFlow', () => {
  // An imported header line: running head, a Word tab (a flex gap), then the page number.
  const tabbed = '<p style="display:flex; align-items:baseline; margin:0"><span>Running head</span><span style="flex:1 1 0"></span><span>{page}</span></p>'

  it('centres, left-aligns or right-aligns every imported line', () => {
    for (const placement of ['left', 'center', 'right'] as const) {
      const line = new DOMParser().parseFromString(placeZoneFlow(tabbed, placement), 'text/html').querySelector('p')!
      expect(line.style.textAlign).toBe(placement)
      expect(line.style.display).toBe('')
      expect(line.innerHTML).not.toContain('flex:1 1 0')
      expect(line.textContent).toContain('Running head')
    }
  })

  it('splits a centred line into text on the left and the page number on the right', () => {
    const centred = '<p style="text-align:center"><span>Running head </span><span>{page}</span></p>'
    const line = new DOMParser().parseFromString(placeZoneFlow(centred, 'split'), 'text/html').querySelector('p')!
    expect(line.style.display).toBe('flex')
    expect(line.style.textAlign).toBe('left')
    const parts = Array.from(line.children).map((child) => child.getAttribute('style') ?? child.textContent)
    expect(parts).toEqual(['Running head ', 'flex:1 1 0', '{page}'])
  })

  it('puts a line holding only the page number at the right when split', () => {
    const line = new DOMParser().parseFromString(placeZoneFlow('<p style="text-align:center">{page}</p>', 'split'), 'text/html').querySelector('p')!
    expect(line.style.textAlign).toBe('right')
  })

  it('applies the stored placement to an imported header', () => {
    const layout: PageLayoutData = {
      sections: [{ index: 0, header: 'h', footer: null, first_header: null, first_footer: null, title_pg: false, number_start: null, number_format: 'decimal', header_distance: 48, footer_distance: 48 }],
      parts: { h: { flow: tabbed, art: '' } },
      repeat_art: '',
      page_art: {},
      placement: { header: 'center' },
    }
    expect(pageZones(layout, { starts: [], pageCount: 1 }, 1).header).toContain('text-align: center')
  })
})
