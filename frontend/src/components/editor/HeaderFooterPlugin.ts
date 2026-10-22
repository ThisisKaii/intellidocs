import { Extension } from "@tiptap/core"

// Core types for the editor
type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

type PageOrientation = 'portrait' | 'landscape'

interface MarginValues {
  top: number
  bottom: number
  left: number
  right: number
  contentMarginTop?: number
  contentMarginBottom?: number
}

/** Page number format options. */
type PageNumberFormat = 'none' | 'number' | 'roman'

/** Horizontal placement of a header/footer zone's content. */
type HeaderFooterPlacement = 'left' | 'center' | 'right' | 'split'

/** Individual header/footer zone configuration. */
interface HeaderFooterZoneConfig {
  id: string
  label: string
  content: string
  numberFormat: PageNumberFormat
  startAt: number
  enabled: boolean
}

/** Complete header/footer configuration for the document. */
interface HeaderFooterConfig {
  header: {
    default: HeaderFooterZoneConfig
    firstPage?: HeaderFooterZoneConfig
    evenPages?: HeaderFooterZoneConfig
    oddPages?: HeaderFooterZoneConfig
    /** Where the header line sits: left, center, right, or split (text left, number right). */
    placement: HeaderFooterPlacement
  }
  footer: {
    default: HeaderFooterZoneConfig
    firstPage?: HeaderFooterZoneConfig
    evenPages?: HeaderFooterZoneConfig
    oddPages?: HeaderFooterZoneConfig
    /** Where the footer line sits: left, center, right, or split (text left, number right). */
    placement: HeaderFooterPlacement
  }
  differentFirstPage: boolean
  differentOddEven: boolean
  headerMargin: number
  footerMargin: number
  sections: Array<{
    name: string
    startPage: number
    numberFormat: PageNumberFormat
    startAt: number
  }>
}

interface HeaderFooterState {
  activeZone: string | null
  inHeaderFooterMode: boolean
  config: HeaderFooterConfig
  currentPageIndex: number
}

/** Default header/footer configuration factory. */
function createDefaultHeaderFooterConfig(): HeaderFooterConfig {
  const emptyZone = (id: string, label: string): HeaderFooterZoneConfig => ({
    id,
    label,
    content: '',
    numberFormat: 'none',
    startAt: 1,
    enabled: true,
  })

  return {
    header: {
      default: emptyZone('header-default', 'Header'),
      firstPage: emptyZone('header-first', 'First Page Header'),
      evenPages: emptyZone('header-even', 'Even Page Header'),
      oddPages: emptyZone('header-odd', 'Odd Page Header'),
      placement: 'split',
    },
    footer: {
      default: emptyZone('footer-default', 'Footer'),
      firstPage: emptyZone('footer-first', 'First Page Footer'),
      evenPages: emptyZone('footer-even', 'Even Page Footer'),
      oddPages: emptyZone('footer-odd', 'Odd Page Footer'),
      placement: 'split',
    },
    differentFirstPage: false,
    differentOddEven: false,
    headerMargin: 0.5,
    footerMargin: 0.5,
    sections: [
      { name: 'Prelims', startPage: 0, numberFormat: 'roman', startAt: 1 },
      { name: 'Main', startPage: 1, numberFormat: 'number', startAt: 1 },
    ],
  }
}

/** Convert inches to pixels at 96 DPI. */
function inToPx(inches: number): number {
  return Math.round(inches * 96)
}

const PAGE_SIZES: Record<PageSizeKey, { label: string; width: number; height: number }> = {
  short:  { label: 'Short (8.5x11")',  width: 816,  height: 1056 },
  long:   { label: 'Long (8.5x13")',   width: 816,  height: 1248 },
  a4:     { label: 'A4 (8.27x11.69")', width: 794,  height: 1123 },
  letter: { label: 'Letter (8.5x11")', width: 816,  height: 1056 },
  legal:  { label: 'Legal (8.5x14")',  width: 816,  height: 1344 },
}

export const HeaderFooterExtension = Extension.create({
  name: 'headerFooter',
  addOptions() { return { config: {} } },
  addProseMirrorPlugins() { return [] }
})

// Re-export all types
export type {
  PageSizeKey,
  PageOrientation,
  MarginValues,
  PageNumberFormat,
  HeaderFooterPlacement,
  HeaderFooterZoneConfig,
  HeaderFooterConfig,
  HeaderFooterState,
}
export { createDefaultHeaderFooterConfig, inToPx, PAGE_SIZES }