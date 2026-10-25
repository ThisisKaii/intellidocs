/** One Word section's header/footer choice and page numbering (mirrors the server's PageLayoutSection). */
export interface PageLayoutSection {
  index: number
  header: string | null
  footer: string | null
  first_header: string | null
  first_footer: string | null
  title_pg: boolean
  number_start: number | null
  number_format: string
  header_distance: number
  footer_distance: number
}

/** What an import keeps of a document's page furniture beyond header/footer text. */
export interface PageLayoutData {
  sections: PageLayoutSection[]
  parts: Record<string, { flow: string; art: string }>
  repeat_art: string
  page_art: Record<string, string>
}

/** Where each section starts and how many pages the document has, measured from the laid-out editor. */
export interface PageMeasure {
  /** 1-based first page of each section that opens on its own page. */
  starts: Array<{ section: number; page: number }>
  pageCount: number
}

const COUNTER_STYLES: Record<string, string> = {
  lowerRoman: 'lower-roman',
  upperRoman: 'upper-roman',
  lowerLetter: 'lower-alpha',
  upperLetter: 'upper-alpha',
}

/** The section a page belongs to: the last one that started on or before it. */
export function sectionForPage(
  layout: PageLayoutData,
  measure: PageMeasure,
  page: number,
): { section: PageLayoutSection; start: number } | null {
  let current = layout.sections[0] ?? null
  let start = 1
  for (const entry of measure.starts) {
    if (entry.page > page) continue
    const found = layout.sections.find((section) => section.index === entry.section)
    if (found) {
      current = found
      start = entry.page
    }
  }
  return current ? { section: current, start } : null
}

/** One zone's absolutely positioned art plus its flowing text, ready for the pagination library. */
function zoneHtml(
  layout: PageLayoutData,
  key: string | null,
  kind: 'header' | 'footer',
  section: PageLayoutSection,
  extraArt: string,
): string {
  const part = key ? layout.parts[key] : undefined
  const art = `${extraArt}${part?.art ?? ''}`
  const distance = kind === 'header' ? section.header_distance : section.footer_distance
  const artBox = art
    ? `<div style="position:absolute;left:calc(var(--rm-margin-left) * -1);top:calc(var(--rm-margin-top) * -0.5);width:var(--rm-page-width);height:var(--rm-page-height);pointer-events:none">${art}</div>`
    : ''
  if (!part?.flow) return artBox
  const place =
    kind === 'header'
      ? `top:calc(${distance}px - var(--rm-margin-top) * 0.5)`
      : `bottom:calc(${distance}px - var(--rm-margin-bottom) * 0.5 - 9px)`
  return `${artBox}<div style="position:absolute;left:var(--rm-margin-left);right:var(--rm-margin-right);${place};font-size:11pt">${part.flow}</div>`
}

/**
 * The header and footer HTML for one page. Pictures that repeat (running art)
 * and the page's own art are drawn from the header zone of that page; the
 * section's chosen header and footer parts supply the flowing text.
 */
export function pageZones(layout: PageLayoutData, measure: PageMeasure, page: number): { header: string; footer: string } {
  const found = sectionForPage(layout, measure, page)
  if (!found) return { header: '', footer: '' }
  const { section, start } = found
  const first = section.title_pg && page === start
  const headerKey = first ? section.first_header : section.header
  const footerKey = first ? section.first_footer : section.footer
  const extra = `${layout.repeat_art}${layout.page_art[String(page)] ?? ''}`
  return {
    header: zoneHtml(layout, headerKey, 'header', section, extra),
    footer: zoneHtml(layout, footerKey, 'footer', section, ''),
  }
}

/**
 * CSS that restarts page numbers and changes their format per section.
 *
 * The pagination library numbers a page's header from `page-number-plus` (in the
 * break before the page) and its footer from `page-number` (in the break after
 * the previous page), so each restart resets the counter in the break that
 * renders that page's zone.
 */
export function numberingCss(layout: PageLayoutData, measure: PageMeasure): string {
  const rules: string[] = []
  const first = layout.sections[0]
  if (!first) return ''
  const starts = [{ section: first, page: 1 }]
  for (const entry of measure.starts) {
    const found = layout.sections.find((section) => section.index === entry.section)
    if (found) starts.push({ section: found, page: entry.page })
  }

  starts.forEach((item, index) => {
    const from = item.page
    const to = index + 1 < starts.length ? starts[index + 1].page - 1 : Math.max(measure.pageCount, from)
    const style = COUNTER_STYLES[item.section.number_format]
    const hidden = item.section.number_format === 'none'
    const start = item.section.number_start
    // Header of page p is drawn in break p-2 (1-based child p-1); footer of page p in break p-1 (child p).
    if (start !== null) {
      if (from === 1) rules.push(`.rm-with-pagination .rm-first-page-header { counter-reset: page-number page-number-plus ${start}; }`)
      else rules.push(`.rm-with-pagination .rm-pages-wrapper > .rm-page-break:nth-child(${from - 1}) { counter-reset: page-number-plus ${start - 1}; }`)
      rules.push(`.rm-with-pagination .rm-pages-wrapper > .rm-page-break:nth-child(${from}) { counter-reset: page-number ${start - 1}; }`)
    }
    if (!style && !hidden) return
    const headerValue = hidden ? '""' : `counter(page-number-plus, ${style})`
    const footerValue = hidden ? '""' : `counter(page-number, ${style})`
    if (from === 1) rules.push(`.rm-with-pagination .rm-first-page-header .rm-page-number-plus::before { content: ${headerValue}; }`)
    if (to >= 2) {
      rules.push(
        `.rm-with-pagination .rm-pages-wrapper > .rm-page-break:nth-child(n+${Math.max(1, from - 1)}):nth-child(-n+${to - 1}) .rm-page-number-plus::before { content: ${headerValue}; }`,
      )
    }
    rules.push(
      `.rm-with-pagination .rm-pages-wrapper > .rm-page-break:nth-child(n+${from}):nth-child(-n+${to}) .rm-page-number::before { content: ${footerValue}; }`,
    )
  })
  return rules.join('\n')
}

/** The measured section starts and page count as one comparable string, so state updates only on real changes. */
export function measureKey(measure: PageMeasure): string {
  return `${measure.pageCount}|${measure.starts.map((entry) => `${entry.section}@${entry.page}`).join(',')}`
}
