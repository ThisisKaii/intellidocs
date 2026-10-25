import { describe, expect, it } from 'vitest'
import { buildChartSpecs, chartToCsv, fullReportCsv } from './reportCharts'
import type { ReportTimeseries, SystemReport } from '../types/admin'

const report: SystemReport = {
  totalUsers: 10,
  pendingApplicants: 1,
  byRole: { student: 7, professor: 2, admin: 1 },
  totalDocuments: 30,
  activeDocuments: 28,
  softDeletedDocuments: 2,
  totalFormattingActions: 100,
  feedback: {
    total: 5,
    accepted: 3,
    rejected: 2,
    acceptanceRate: '60.00%',
    byType: { 'grammar, spelling': { total: 5, accepted: 3, rejected: 2, acceptanceRate: '60.00%' } },
  },
  generatedAt: '2026-10-25T00:00:00Z',
}

const series: ReportTimeseries = {
  weeks: 2,
  signups: [{ week: '2026-10-12', count: 1 }, { week: '2026-10-19', count: 4 }],
  documents: [{ week: '2026-10-12', count: 0 }, { week: '2026-10-19', count: 9 }],
  scans: [{ week: '2026-10-12', count: 2 }, { week: '2026-10-19', count: 0 }],
  flaggedScans: 1,
  totalScans: 2,
  applicationsByStatus: { pending: 1, approved: 8, rejected: 1 },
  generatedAt: '2026-10-25T00:00:00Z',
}

describe('buildChartSpecs', () => {
  const specs = buildChartSpecs(report, series)

  it('builds the six report charts', () => {
    expect(specs.map((s) => s.id)).toEqual(['roles', 'signups', 'documents', 'feedback', 'scans', 'applications'])
  })

  it('labels weeks with the month and day', () => {
    expect(specs[1].rows[1]).toEqual({ week: 'Oct 19', count: 4 })
  })
})

describe('chartToCsv', () => {
  it('prints the axis then each series, quoting channel names with commas', () => {
    const feedback = buildChartSpecs(report, series).find((s) => s.id === 'feedback')!
    expect(chartToCsv(feedback)).toBe('Channel,Accepted,Rejected\r\n"grammar, spelling",3,2')
  })
})

describe('fullReportCsv', () => {
  it('puts every chart in one file with its title', () => {
    const csv = fullReportCsv(buildChartSpecs(report, series), report.generatedAt)
    expect(csv.startsWith('IntelliDocs system report,2026-10-25T00:00:00Z')).toBe(true)
    expect(csv).toContain('Users by role\r\nRole,Users\r\nStudent,7')
  })
})
