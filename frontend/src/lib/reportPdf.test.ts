import { describe, expect, it, vi } from 'vitest'
import { jsPDF } from 'jspdf'
import { renderAdminReport, reportFileName, reportMetrics } from './reportPdf'
import { buildChartSpecs, timeseriesCsv } from './reportCharts'
import type { ChartImage } from './chartRaster'
import type { AdminUserRecord, ReportTimeseries, SystemReport } from '../types/admin'

const report: SystemReport = {
  totalUsers: 12,
  pendingApplicants: 2,
  byRole: { user: 5, student: 4, professor: 2, admin: 1 },
  totalDocuments: 40,
  activeDocuments: 37,
  softDeletedDocuments: 3,
  totalFormattingActions: 210,
  feedback: {
    total: 10,
    accepted: 7,
    rejected: 3,
    acceptanceRate: '70.00%',
    byType: { format_prompt: { total: 10, accepted: 7, rejected: 3, acceptanceRate: '70.00%' } },
  },
  generatedAt: '2026-11-05T08:00:00Z',
}

const series: ReportTimeseries = {
  weeks: 2,
  signups: [{ week: '2026-10-26', count: 3 }, { week: '2026-11-02', count: 5 }],
  documents: [{ week: '2026-10-26', count: 8 }, { week: '2026-11-02', count: 11 }],
  scans: [{ week: '2026-10-26', count: 1 }, { week: '2026-11-02', count: 4 }],
  flaggedScans: 2,
  totalScans: 5,
  applicationsByStatus: { pending: 2, approved: 6, rejected: 1 },
  generatedAt: '2026-11-05T08:00:00Z',
}

const users: AdminUserRecord[] = [
  {
    id: 'p1', user_id: 'u1', role_id: 4, role_name: 'user', verification_status: 'approved',
    display_name: 'Ada', email: 'ada@example.com', phone: null, document_count: 3,
    created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
  },
]

/** A 1x1 white PNG, standing in for a rasterized chart. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'

describe('renderAdminReport', () => {
  const specs = buildChartSpecs(report, series)
  const images: Record<string, ChartImage> = Object.fromEntries(
    specs.slice(0, 4).map((spec) => [spec.id, { dataUrl: PNG, width: 600, height: 260 }]),
  )

  it('embeds one PNG per captured chart', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const addImage = vi.spyOn(doc, 'addImage')
    renderAdminReport(doc, report, series, specs, images, users)
    expect(addImage).toHaveBeenCalledTimes(4)
    // addImage is overloaded; the report uses the (data, format, x, y, w, h) form.
    const calls = addImage.mock.calls as unknown as Array<[string, string, ...number[]]>
    expect(calls.every((call) => call[0] === PNG && call[1] === 'PNG')).toBe(true)
  })

  it('writes the title, every metric, chart captions and the tables', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const text = vi.spyOn(doc, 'text')
    renderAdminReport(doc, report, series, specs, images, users)
    const written = text.mock.calls.map((call) => String(call[0]))
    expect(written).toContain('IntelliDocs System Report')
    for (const [label, value] of reportMetrics(report, series)) {
      expect(written).toContain(label)
      expect(written).toContain(value)
    }
    for (const spec of specs) expect(written).toContain(spec.title)
    expect(written).toContain('format_prompt')
    expect(written).toContain('ada@example.com')
  })

  it('notes charts that have no image instead of failing', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const text = vi.spyOn(doc, 'text')
    renderAdminReport(doc, report, series, specs, {}, [])
    expect(text.mock.calls.filter((call) => call[0] === 'No data recorded for this chart yet.')).toHaveLength(specs.length)
  })

  it('produces a real PDF document', () => {
    const doc = renderAdminReport(new jsPDF({ unit: 'mm', format: 'a4' }), report, series, specs, images, users)
    expect(doc.output().startsWith('%PDF-')).toBe(true)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })

  it('names files by report date', () => {
    expect(reportFileName(report.generatedAt, 'pdf')).toBe('intellidocs-report-2026-11-05.pdf')
    expect(reportFileName(report.generatedAt, 'csv', '-timeseries')).toBe('intellidocs-report-timeseries-2026-11-05.csv')
  })
})

describe('timeseriesCsv', () => {
  it('puts the weekly data points in one table with ISO week starts', () => {
    const csv = timeseriesCsv(series)
    expect(csv.startsWith('week_start,signups,documents_created,originality_scans\r\n2026-10-26,3,8,1\r\n2026-11-02,5,11,4')).toBe(true)
  })

  it('appends application-status and scan totals as their own tables', () => {
    const csv = timeseriesCsv(series)
    expect(csv).toContain('application_status,count\r\npending,2\r\napproved,6\r\nrejected,1')
    expect(csv).toContain('total_scans,flagged_scans\r\n5,2')
  })

  it('zero-fills a week missing from one metric', () => {
    const csv = timeseriesCsv({ ...series, scans: [{ week: '2026-11-02', count: 4 }] })
    expect(csv).toContain('2026-10-26,3,8,0')
  })
})
