import { describe, expect, it } from 'vitest'
import { numberingCss, pageZones, sectionForPage, type PageLayoutData, type PageLayoutSection } from './pageLayout'
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
})

describe('numberingCss', () => {
  const css = numberingCss(layout, measure)
  it('restarts the counters in the breaks that draw the section start page', () => {
    expect(css).toContain('.rm-page-break:nth-child(3) { counter-reset: page-number-plus 0; }')
    expect(css).toContain('.rm-page-break:nth-child(4) { counter-reset: page-number 0; }')
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
