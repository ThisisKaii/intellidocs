import { CHART_COLORS } from './chartColors'
import { toCsv, type CsvCell } from './csv'
import type { ReportTimeseries, SystemReport } from '../types/admin'

/** One series drawn in a chart. */
export interface ChartSeries {
  key: string
  name: string
  color: string
}

/** Everything needed to draw a report chart and to export its data. */
export interface ChartSpec {
  id: string
  title: string
  kind: 'bar' | 'line' | 'stacked'
  /** Field of each row that labels the horizontal axis. */
  xKey: string
  xLabel: string
  series: ChartSeries[]
  rows: Array<Record<string, string | number>>
}

/** Short "Oct 19" label for a week's Monday, used on chart axes. */
function weekLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** The charts of the admin Reports tab, built from the report and its weekly series. */
export function buildChartSpecs(report: SystemReport, series: ReportTimeseries): ChartSpec[] {
  const weekly = (items: ReportTimeseries['signups']): ChartSpec['rows'] =>
    items.map((item) => ({ week: weekLabel(item.week), count: item.count }))

  return [
    {
      id: 'roles',
      title: 'Users by role',
      kind: 'bar',
      xKey: 'role',
      xLabel: 'Role',
      series: [{ key: 'count', name: 'Users', color: CHART_COLORS.primary }],
      rows: [
        { role: 'User', count: report.byRole.user ?? 0 },
        { role: 'Student', count: report.byRole.student },
        { role: 'Professor', count: report.byRole.professor },
        { role: 'Admin', count: report.byRole.admin },
      ],
    },
    {
      id: 'signups',
      title: `New sign-ups per week (last ${series.weeks} weeks)`,
      kind: 'line',
      xKey: 'week',
      xLabel: 'Week starting',
      series: [{ key: 'count', name: 'Sign-ups', color: CHART_COLORS.green }],
      rows: weekly(series.signups),
    },
    {
      id: 'documents',
      title: `Documents created per week (last ${series.weeks} weeks)`,
      kind: 'bar',
      xKey: 'week',
      xLabel: 'Week starting',
      series: [{ key: 'count', name: 'Documents', color: CHART_COLORS.primary }],
      rows: weekly(series.documents),
    },
    {
      id: 'feedback',
      title: 'AI suggestions by channel',
      kind: 'stacked',
      xKey: 'channel',
      xLabel: 'Channel',
      series: [
        { key: 'accepted', name: 'Accepted', color: CHART_COLORS.green },
        { key: 'rejected', name: 'Rejected', color: CHART_COLORS.red },
      ],
      rows: Object.entries(report.feedback.byType).map(([channel, stats]) => ({
        channel,
        accepted: stats.accepted,
        rejected: stats.rejected,
      })),
    },
    {
      id: 'scans',
      title: `Plagiarism scans per week (last ${series.weeks} weeks)`,
      kind: 'bar',
      xKey: 'week',
      xLabel: 'Week starting',
      series: [{ key: 'count', name: 'Scans', color: CHART_COLORS.violet }],
      rows: weekly(series.scans),
    },
    {
      id: 'applications',
      title: 'Verification applications by status',
      kind: 'bar',
      xKey: 'status',
      xLabel: 'Status',
      series: [{ key: 'count', name: 'Accounts', color: CHART_COLORS.amber }],
      rows: [
        { status: 'Pending', count: series.applicationsByStatus.pending },
        { status: 'Approved', count: series.applicationsByStatus.approved },
        { status: 'Rejected', count: series.applicationsByStatus.rejected },
      ],
    },
  ]
}

/** The CSV for one chart: its axis column then one column per series. */
export function chartToCsv(spec: ChartSpec): string {
  type Row = Record<string, CsvCell>
  const columns = [
    { key: spec.xKey, label: spec.xLabel },
    ...spec.series.map((s) => ({ key: s.key, label: s.name })),
  ]
  return toCsv(spec.rows as Row[], columns)
}

/** Every chart in one CSV file, each section introduced by its title and separated by a blank line. */
export function fullReportCsv(specs: ChartSpec[], generatedAt: string): string {
  const sections = specs.map((spec) => `${spec.title}\r\n${chartToCsv(spec)}`)
  return [`IntelliDocs system report,${generatedAt}`, ...sections].join('\r\n\r\n')
}

/**
 * The weekly timeseries behind the line/bar charts as one clean table (ISO week start, one
 * column per metric), followed by the application-status and scan totals. Weeks are the
 * server's Monday-UTC buckets, oldest first.
 */
export function timeseriesCsv(series: ReportTimeseries): string {
  type Row = Record<string, CsvCell>
  const byWeek = new Map<string, Row>()
  const put = (items: ReportTimeseries['signups'], key: string): void => {
    for (const item of items) {
      const row = byWeek.get(item.week) ?? { week: item.week, signups: 0, documents: 0, scans: 0 }
      row[key] = item.count
      byWeek.set(item.week, row)
    }
  }
  put(series.signups, 'signups')
  put(series.documents, 'documents')
  put(series.scans, 'scans')
  const weekly = [...byWeek.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)))

  const weeklyTable = toCsv(weekly, [
    { key: 'week', label: 'week_start' },
    { key: 'signups', label: 'signups' },
    { key: 'documents', label: 'documents_created' },
    { key: 'scans', label: 'originality_scans' },
  ])
  const statusTable = toCsv<Row>(
    (['pending', 'approved', 'rejected'] as const).map((status) => ({ status, count: series.applicationsByStatus[status] })),
    [
      { key: 'status', label: 'application_status' },
      { key: 'count', label: 'count' },
    ],
  )
  const scanTable = toCsv<Row>([{ total: series.totalScans, flagged: series.flaggedScans }], [
    { key: 'total', label: 'total_scans' },
    { key: 'flagged', label: 'flagged_scans' },
  ])
  return [weeklyTable, statusTable, scanTable].join('\r\n\r\n')
}
