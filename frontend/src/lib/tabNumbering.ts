import type { DocumentTabSummary, PageNumberFormat, TabNumbering } from '@/services/api'
import { numberingCss, type PageLayoutData } from './pageLayout'

/**
 * Page numbers across the tabs of a document split into tabs.
 *
 * Each tab is its own editor, numbered from its first page. Where that is comes from the tabs
 * before it: their stored page counts (measured when each was last open, so no other tab has to be
 * loaded) and their numbering. A tab with numbering set starts a new run (its own format, and a
 * restart at `start` when `restart`); a tab without continues the run before it.
 */

export interface ResolvedTabNumbering {
  /** The number the tab's first page shows. */
  start: number
  format: TabNumbering['format']
  /** The tab's first page shows no number (a title page). */
  hideFirst: boolean
  /** The tab's first page counted through the whole document (1 = the document's first page). */
  firstPage: number
}

/** The format numbers take when no tab says otherwise, from the document's page-number setting. */
export function defaultTabFormat(documentFormat: PageNumberFormat): TabNumbering['format'] {
  if (documentFormat === 'none') return 'none'
  return documentFormat === 'roman' ? 'roman' : 'arabic'
}

export function resolveTabNumbering(
  tabs: Array<Pick<DocumentTabSummary, 'tab_id' | 'page_count' | 'numbering'>>,
  tabId: string,
  defaultFormat: TabNumbering['format'],
): ResolvedTabNumbering | null {
  let format = defaultFormat
  let next = 1
  let page = 1
  for (const tab of tabs) {
    let start = next
    let hideFirst = false
    if (tab.numbering) {
      format = tab.numbering.format
      if (tab.numbering.restart) start = tab.numbering.start
      hideFirst = tab.numbering.hideFirst
    }
    if (tab.tab_id === tabId) return { start, format, hideFirst, firstPage: page }
    const pages = Math.max(0, tab.page_count ?? 0)
    next = start + pages
    page += pages
  }
  return null
}

/**
 * The numbering a split sets, from the document's page-number setting: a manuscript numbers the
 * front matter in Roman numerals with the title page unnumbered and starts Chapter 1 at 1.
 */
export function splitNumbering(
  documentFormat: PageNumberFormat,
  kind: 'front' | 'chapter' | 'back',
  firstChapter: boolean,
): TabNumbering | null {
  if (documentFormat !== 'manuscript') return null
  if (kind === 'front') return { format: 'roman', restart: true, start: 1, hideFirst: true }
  if (kind === 'chapter' && firstChapter) return { format: 'arabic', restart: true, start: 1, hideFirst: false }
  return null
}

const COUNTER_FORMAT: Record<TabNumbering['format'], string> = { none: 'none', roman: 'lowerRoman', arabic: 'decimal' }

/** CSS numbering one tab's pages: its starting number and format, the first page hidden if asked. */
export function tabNumberingCss(numbering: ResolvedTabNumbering, pageCount: number): string {
  const section = (index: number, format: string, start: number | null) => ({
    index,
    header: null,
    footer: null,
    first_header: null,
    first_footer: null,
    title_pg: false,
    number_start: start,
    number_format: format,
    header_distance: 0,
    footer_distance: 0,
  })
  const format = COUNTER_FORMAT[numbering.format]
  const layout: PageLayoutData = {
    sections: numbering.hideFirst ? [section(0, 'none', numbering.start), section(1, format, null)] : [section(0, format, numbering.start)],
    parts: {},
    repeat_art: '',
    page_art: {},
  }
  const starts = numbering.hideFirst && pageCount >= 2 ? [{ section: 1, page: 2 }] : []
  return numberingCss(layout, { starts, pageCount: Math.max(1, pageCount) })
}

/** A Word number format as a tab's format. */
function tabFormatOf(wordFormat: string | null | undefined): TabNumbering['format'] {
  if (wordFormat === 'none') return 'none'
  return wordFormat === 'lowerRoman' || wordFormat === 'upperRoman' ? 'roman' : 'arabic'
}

/**
 * For an imported Word document: the numbering a tab gets from the section that opens it — a
 * restart where the section restarts (Chapter 1 at 1), its number format, or null to continue.
 */
export function sectionTabNumbering(numbering: { start: number | null; format: string } | null | undefined): TabNumbering | null {
  if (!numbering) return null
  const format = tabFormatOf(numbering.format)
  if (numbering.start === null) return format === 'arabic' ? null : { format, restart: false, start: 1, hideFirst: false }
  return { format, restart: true, start: numbering.start, hideFirst: false }
}

/**
 * An imported document's layout as one tab sees it: the pages before the tab's first section break
 * are numbered from where the tab starts (its resolved number and format), not from the document's
 * first section. Section breaks inside the tab keep their own numbering.
 */
export function layoutForTab(layout: PageLayoutData, numbering: ResolvedTabNumbering): PageLayoutData {
  const [first, ...rest] = layout.sections
  if (!first) return layout
  return {
    ...layout,
    sections: [{ ...first, number_start: numbering.start, number_format: COUNTER_FORMAT[numbering.format] }, ...rest],
  }
}

function lowerRoman(value: number): string {
  const table: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let rest = Math.max(1, Math.floor(value))
  let out = ''
  for (const [amount, letters] of table) {
    while (rest >= amount) {
      out += letters
      rest -= amount
    }
  }
  return out
}

/** How page `page` of a tab prints (1 = the tab's first page): its continued number in its format. */
export function tabPageLabel(numbering: ResolvedTabNumbering | null, page: number): string {
  if (!numbering) return String(page)
  const value = numbering.start + page - 1
  if (numbering.format === 'roman') return lowerRoman(value)
  if (numbering.format === 'none') return ''
  return String(value)
}
