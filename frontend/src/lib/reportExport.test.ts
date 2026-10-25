import { describe, expect, it } from 'vitest'
import { buildAdminReportHtml } from './reportExport'
import { buildChartSpecs } from './reportCharts'
import type { ReportTimeseries, SystemReport } from '../types/admin'

const report: SystemReport = {
  totalUsers: 3,
  pendingApplicants: 0,
  byRole: { student: 2, professor: 1, admin: 0 },
  totalDocuments: 4,
  activeDocuments: 4,
  softDeletedDocuments: 0,
  totalFormattingActions: 9,
  feedback: { total: 0, accepted: 0, rejected: 0, acceptanceRate: '0.00%', byType: {} },
  generatedAt: '2026-10-25T00:00:00Z',
}
const series: ReportTimeseries = {
  weeks: 1,
  signups: [{ week: '2026-10-19', count: 1 }],
  documents: [{ week: '2026-10-19', count: 1 }],
  scans: [{ week: '2026-10-19', count: 0 }],
  flaggedScans: 0,
  totalScans: 0,
  applicationsByStatus: { pending: 0, approved: 3, rejected: 0 },
  generatedAt: '2026-10-25T00:00:00Z',
}

describe('buildAdminReportHtml', () => {
  const specs = buildChartSpecs(report, series)

  it('inlines the chart svg for charts that have one', () => {
    const html = buildAdminReportHtml(report, [], specs, { roles: '<svg id="roles-chart"></svg>' })
    expect(html).toContain('<svg id="roles-chart"></svg>')
    expect(html).toContain('Users by role')
  })

  it('says so when a chart has no data', () => {
    const html = buildAdminReportHtml(report, [], specs, {})
    expect(html).toContain('No data recorded for this chart yet.')
  })

  it('escapes user-supplied text in the tables', () => {
    const user = {
      id: '1', user_id: 'u', role_id: 1, role_name: 'student' as const, verification_status: 'approved' as const,
      display_name: '<script>alert(1)</script>', email: 'a@b.c', phone: null, document_count: 0,
      created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    }
    const html = buildAdminReportHtml(report, [user], specs, {})
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
