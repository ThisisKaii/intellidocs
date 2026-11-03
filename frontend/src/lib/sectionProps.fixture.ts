import type { SectionProps } from './sectionProps'

/** A complete, valid section (DM-OUHRODI-like A4 with a footer part and roman numbering), for tests. */
export const SAMPLE_SECTION: SectionProps = {
  kind: 'nextPage',
  page: { width: 794, height: 1123 },
  orientation: 'portrait',
  margins: { top: 89.3, right: 75.8, bottom: 68.2, left: 94.1, header: 0, footer: 48, gutter: 0 },
  columns: { count: 1, gap: 48, widths: null },
  headers: { default: null, first: null, even: null },
  footers: { default: 'footer3', first: null, even: null },
  titlePage: false,
  numbering: { start: 1, format: 'lowerRoman' },
}
