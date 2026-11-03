/**
 * A Word section's own properties, carried by the break that starts the section: a `pageBreak` for a
 * section that starts on a new page, a zero-height `sectionMark` for a continuous one. Section 0 is
 * the document's page setup and needs none. Lengths are CSS px (96 per inch), as the converter writes
 * them. Stored in the editor JSON as an object and in HTML as `data-section-props` (JSON).
 */

export type SectionKind = 'nextPage' | 'continuous' | 'evenPage' | 'oddPage'

export interface SectionMargins {
  top: number
  right: number
  bottom: number
  left: number
  /** Distance of the header from the page's top edge. */
  header: number
  /** Distance of the footer from the page's bottom edge. */
  footer: number
  gutter: number
}

/** Header or footer part keys (into the document's page layout parts) for each kind of page. */
export interface SectionParts {
  default: string | null
  first: string | null
  even: string | null
}

export interface SectionProps {
  kind: SectionKind
  page: { width: number; height: number }
  orientation: 'portrait' | 'landscape'
  margins: SectionMargins
  /** Text columns; widths are null when Word spaces them evenly. */
  columns: { count: number; gap: number; widths: number[] | null }
  headers: SectionParts
  footers: SectionParts
  /** The section's first page uses the `first` header and footer. */
  titlePage: boolean
  /** Page numbering: a restart value (null continues from the previous section) and a Word number format. */
  numbering: { start: number | null; format: string }
}

const KINDS: readonly SectionKind[] = ['nextPage', 'continuous', 'evenPage', 'oddPage']
const MAX_PX = 20000

type Raw = Record<string, unknown>

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const isLength = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PX

function readParts(value: unknown): SectionParts | null {
  if (!isObject(value)) return null
  const key = (part: unknown): string | null | undefined =>
    part === null ? null : typeof part === 'string' && part.length <= 200 ? part : undefined
  const parts = { default: key(value.default), first: key(value.first), even: key(value.even) }
  if (parts.default === undefined || parts.first === undefined || parts.even === undefined) return null
  return parts as SectionParts
}

/**
 * Section properties from untrusted input (a parsed HTML attribute or stored JSON), or null when any
 * field is missing or out of range. A section with unreadable properties is laid out with the page
 * setup instead of with half-valid values.
 */
export function readSectionProps(value: unknown): SectionProps | null {
  if (!isObject(value)) return null
  const { kind, page, orientation, margins, columns, numbering } = value
  if (typeof kind !== 'string' || !KINDS.includes(kind as SectionKind)) return null
  if (!isObject(page) || !isLength(page.width) || !isLength(page.height)) return null
  if (orientation !== 'portrait' && orientation !== 'landscape') return null
  if (!isObject(margins)) return null
  const sides = ['top', 'right', 'bottom', 'left', 'header', 'footer', 'gutter'] as const
  if (!sides.every((side) => isLength(margins[side]))) return null
  if (!isObject(columns) || !Number.isInteger(columns.count) || (columns.count as number) < 1 || (columns.count as number) > 16) return null
  if (!isLength(columns.gap)) return null
  const widths = columns.widths
  if (widths !== null && !(Array.isArray(widths) && widths.length === columns.count && widths.every(isLength))) return null
  const headers = readParts(value.headers)
  const footers = readParts(value.footers)
  if (!headers || !footers || typeof value.titlePage !== 'boolean') return null
  if (!isObject(numbering) || typeof numbering.format !== 'string' || numbering.format.length > 40) return null
  const start = numbering.start
  if (start !== null && !(Number.isInteger(start) && (start as number) >= 0 && (start as number) <= 100000)) return null
  return {
    kind: kind as SectionKind,
    page: { width: page.width, height: page.height },
    orientation,
    margins: {
      top: Number(margins.top),
      right: Number(margins.right),
      bottom: Number(margins.bottom),
      left: Number(margins.left),
      header: Number(margins.header),
      footer: Number(margins.footer),
      gutter: Number(margins.gutter),
    },
    columns: { count: columns.count as number, gap: columns.gap, widths: widths === null ? null : [...(widths as number[])] },
    headers,
    footers,
    titlePage: value.titlePage,
    numbering: { start: start as number | null, format: numbering.format },
  }
}

/** Section properties from a `data-section-props` attribute (JSON), or null. */
export function parseSectionPropsAttribute(element: HTMLElement): SectionProps | null {
  const raw = element.getAttribute('data-section-props')
  if (!raw) return null
  try {
    return readSectionProps(JSON.parse(raw))
  } catch {
    return null
  }
}

/** The `data-section-props` attribute for a node's section properties (nothing when it has none). */
export function sectionPropsAttribute(props: SectionProps | null): Record<string, string> {
  return props ? { 'data-section-props': JSON.stringify(props) } : {}
}
