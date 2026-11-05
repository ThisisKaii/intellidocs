import type { jsPDF } from 'jspdf'
import type { ChartSpec } from './reportCharts'
import type { ChartImage } from './chartRaster'
import type { AdminUserRecord, ReportTimeseries, SystemReport } from '../types/admin'

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BOTTOM = PAGE_HEIGHT - MARGIN
const INK = '#0f172a'
const MUTED = '#64748b'
const RULE = '#e2e8f0'

/** Headline numbers shown in the metrics grid, in display order. */
export function reportMetrics(report: SystemReport, series: ReportTimeseries): Array<[string, string]> {
  const flagRate = series.totalScans > 0 ? `${Math.round((series.flaggedScans / series.totalScans) * 100)}%` : 'n/a'
  return [
    ['Total users', String(report.totalUsers)],
    ['Pending verifications', String(report.pendingApplicants)],
    ['Active documents', String(report.activeDocuments)],
    ['Total documents', String(report.totalDocuments)],
    ['Formatting actions', String(report.totalFormattingActions)],
    ['AI acceptance', report.feedback.acceptanceRate],
    ['Feedback events', String(report.feedback.total)],
    ['Scans flagged', `${flagRate} (${series.flaggedScans}/${series.totalScans})`],
  ]
}

/** Fit text into `width` mm, ending with an ellipsis when it is cut. */
function clip(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let cut = text
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1)
  return `${cut}...`
}

/** Draw a simple ruled table (header row in muted ink, repeated after page breaks); returns the y after it. */
function drawTable(doc: jsPDF, y: number, title: string, columns: Array<[string, number]>, rows: string[][], empty: string): number {
  y = ensureSpace(doc, y, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(INK)
  doc.text(title, MARGIN, y + 4)
  y += 9
  const header = (): void => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    columns.forEach(([label, x]) => doc.text(label, x, y))
    doc.setDrawColor(RULE)
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_WIDTH, y + 1.5)
    y += 6
    doc.setTextColor(INK)
  }
  header()
  if (rows.length === 0) {
    doc.text(empty, MARGIN, y)
    return y + 8
  }
  for (const row of rows) {
    if (y + 6 > BOTTOM) {
      doc.addPage()
      y = MARGIN
      header()
    }
    row.forEach((cell, i) => {
      const next = columns[i + 1]?.[1] ?? MARGIN + CONTENT_WIDTH
      doc.text(clip(doc, cell, next - columns[i][1] - 2), columns[i][1], y)
    })
    y += 5.5
  }
  return y + 4
}

/** Start a new page when `needed` mm would run past the bottom margin; returns the y to draw at. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM) return y
  doc.addPage()
  return MARGIN
}

/**
 * Lay out the admin system report into `doc` (A4 portrait, mm): title, summary metrics, every
 * chart as an embedded PNG with its caption, the feedback-by-type table and the users table.
 * Charts without an image (no data) get a short note instead.
 */
export function renderAdminReport(
  doc: jsPDF,
  report: SystemReport,
  series: ReportTimeseries,
  specs: ChartSpec[],
  images: Record<string, ChartImage>,
  users: AdminUserRecord[] = [],
): jsPDF {
  let y = MARGIN

  doc.setTextColor(INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('IntelliDocs System Report', MARGIN, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED)
  doc.text(`Generated ${new Date(report.generatedAt).toLocaleString()} - last ${series.weeks} weeks`, MARGIN, y + 12)
  y += 20

  // Summary metrics: a two-column grid of labelled values.
  const metrics = reportMetrics(report, series)
  const cellWidth = CONTENT_WIDTH / 2
  const cellHeight = 14
  metrics.forEach(([label, value], index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = MARGIN + col * cellWidth
    const top = y + row * cellHeight
    doc.setDrawColor(RULE)
    doc.rect(x, top, cellWidth - 2, cellHeight - 2)
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    doc.text(label, x + 3, top + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(INK)
    doc.text(value, x + 3, top + 10.5)
    doc.setFont('helvetica', 'normal')
  })
  y += Math.ceil(metrics.length / 2) * cellHeight + 6

  // Charts, captured from the live dashboard.
  for (const spec of specs) {
    const image = images[spec.id]
    const imageHeight = image ? (CONTENT_WIDTH * image.height) / image.width : 8
    y = ensureSpace(doc, y, imageHeight + 10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(INK)
    doc.text(spec.title, MARGIN, y + 4)
    doc.setFont('helvetica', 'normal')
    y += 7
    if (image) {
      // 'FAST' stores the pixels Flate-compressed (lossless); uncompressed, each chart is ~1 MB.
      doc.addImage(image.dataUrl, 'PNG', MARGIN, y, CONTENT_WIDTH, imageHeight, `chart-${spec.id}`, 'FAST')
    } else {
      doc.setFontSize(9)
      doc.setTextColor(MUTED)
      doc.text('No data recorded for this chart yet.', MARGIN, y + 5)
    }
    y += imageHeight + 6
  }

  // Feedback by suggestion type.
  y = drawTable(
    doc,
    y,
    'AI feedback by suggestion type',
    [['Type', MARGIN], ['Total', MARGIN + 80], ['Accepted', MARGIN + 105], ['Rejected', MARGIN + 130], ['Acceptance', MARGIN + 155]],
    Object.entries(report.feedback.byType).map(([type, stats]) => [type, String(stats.total), String(stats.accepted), String(stats.rejected), stats.acceptanceRate]),
    'No feedback recorded yet.',
  )

  // Users and roles.
  drawTable(
    doc,
    y,
    `Users & roles (${users.length})`,
    [['Name', MARGIN], ['Email', MARGIN + 38], ['Role', MARGIN + 100], ['Status', MARGIN + 124], ['Docs', MARGIN + 146], ['Joined', MARGIN + 160]],
    users.map((u) => [
      u.display_name ?? '-',
      u.email ?? '-',
      u.role_name ?? '-',
      u.verification_status,
      String(u.document_count),
      new Date(u.created_at).toLocaleDateString(),
    ]),
    'No user accounts found.',
  )

  return doc
}

/** File name for a report generated at `generatedAt`. */
export function reportFileName(generatedAt: string, extension: 'pdf' | 'csv', suffix = ''): string {
  return `intellidocs-report${suffix}-${generatedAt.slice(0, 10)}.${extension}`
}

/** Build the PDF with jsPDF (loaded on demand, so it stays out of the main bundle) and download it. */
export async function downloadAdminReportPdf(
  report: SystemReport,
  series: ReportTimeseries,
  specs: ChartSpec[],
  images: Record<string, ChartImage>,
  users: AdminUserRecord[],
): Promise<void> {
  const { jsPDF: JsPdf } = await import('jspdf')
  const doc = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  renderAdminReport(doc, report, series, specs, images, users).save(reportFileName(report.generatedAt, 'pdf'))
}
