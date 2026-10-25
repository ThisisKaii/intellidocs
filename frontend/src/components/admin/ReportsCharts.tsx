import { useMemo, useRef } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileText } from 'lucide-react'
import { chartToCsv, fullReportCsv, buildChartSpecs, type ChartSpec } from '@/lib/reportCharts'
import { downloadTextFile } from '@/lib/csv'
import { exportAdminReportPdf, serializeChartSvgs } from '@/lib/reportExport'
import type { AdminUserRecord, ReportTimeseries, SystemReport } from '@/types/admin'

interface ReportsChartsProps {
  report: SystemReport | null
  series: ReportTimeseries | null
  users: AdminUserRecord[]
  /** Report an export problem to the admin (toast). */
  onError: (message: string) => void
}

/** One chart card with its own CSV download. */
function ChartCard({ spec }: { spec: ChartSpec }): JSX.Element {
  const empty = spec.rows.length === 0 || spec.rows.every((row) => spec.series.every((s) => Number(row[s.key]) === 0))
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
      <Tooltip />
      {spec.series.length > 1 && <Legend />}
    </>
  )

  return (
    <figure data-chart-id={spec.id} className="m-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <figcaption className="text-sm font-semibold">{spec.title}</figcaption>
        <button type="button" onClick={() => downloadTextFile(`${spec.id}.csv`, chartToCsv(spec))} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-secondary" aria-label={`Download ${spec.title} as CSV`}>
          <Download className="size-3" /> CSV
        </button>
      </div>
      {empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No data recorded yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          {spec.kind === 'line' ? (
            <LineChart data={spec.rows}>
              {common}
              {spec.series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />)}
            </LineChart>
          ) : (
            <BarChart data={spec.rows}>
              {common}
              {spec.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={spec.kind === 'stacked' ? 'a' : undefined} radius={spec.kind === 'stacked' ? 0 : [4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </figure>
  )
}

/** Reports tab: headline numbers, six charts, and CSV/PDF downloads of the same data. */
export function ReportsCharts({ report, series, users, onError }: ReportsChartsProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const specs = useMemo(() => (report && series ? buildChartSpecs(report, series) : []), [report, series])

  if (!report || !series) {
    return <p className="text-sm text-muted-foreground">Loading report data…</p>
  }

  const flagRate = series.totalScans > 0 ? `${Math.round((series.flaggedScans / series.totalScans) * 100)}%` : 'n/a'
  const stats: Array<[string, string]> = [
    ['Total users', String(report.totalUsers)],
    ['Pending verifications', String(report.pendingApplicants)],
    ['Active documents', String(report.activeDocuments)],
    ['AI acceptance', report.feedback.acceptanceRate],
    ['Scans flagged', `${flagRate} (${series.flaggedScans}/${series.totalScans})`],
  ]

  /** Download every chart's data as one CSV file. */
  function downloadAllCsv(): void {
    downloadTextFile(`intellidocs-report-${report!.generatedAt.slice(0, 10)}.csv`, fullReportCsv(specs, report!.generatedAt))
  }

  /** Print the report, with the charts as currently drawn, to PDF. */
  function downloadPdf(): void {
    try {
      const svgs = gridRef.current ? serializeChartSvgs(gridRef.current) : {}
      exportAdminReportPdf(report!, users, specs, svgs)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'PDF export failed')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">System analytics</h2>
        <div className="flex gap-2">
          <button type="button" onClick={downloadAllCsv} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary">
            <Download className="size-4" /> Download CSV
          </button>
          <button type="button" onClick={downloadPdf} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <FileText className="size-4" /> Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-background p-3">
            <p className="m-0 text-xs text-muted-foreground">{label}</p>
            <p className="m-0 mt-1 text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div ref={gridRef} className="grid gap-4 lg:grid-cols-2">
        {specs.map((spec) => <ChartCard key={spec.id} spec={spec} />)}
      </div>

      <p className="m-0 text-xs text-muted-foreground">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
    </div>
  )
}
