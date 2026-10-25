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
