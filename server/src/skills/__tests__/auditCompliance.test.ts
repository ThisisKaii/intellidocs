import { auditCompliance } from '../auditCompliance'
import { requestComplianceAudit } from '../../ai/bridge/pythonBridge'

jest.mock('../../ai/bridge/pythonBridge', () => ({
  requestComplianceAudit: jest.fn(),
}))

const mockedAudit = requestComplianceAudit as jest.MockedFunction<
  typeof requestComplianceAudit
>

const pageSetup = {
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
  showHeader: true,
  showFooter: false,
  headerNumberFormat: 'number' as const,
  footerNumberFormat: 'none' as const,
}

const requirements = {
  mandatoryHeadings: ['Introduction', 'References'],
  referenceStyle: 'apa' as const,
  requiredMarginInches: 1,
  referencesRequired: true,
}

function pythonResponse(overrides: Record<string, unknown> = {}) {
  return {
    aggregate_score: 91.05,
    rule_score: 100,
    ml_score: 74.44,
    rule_weight: 0.65,
    ml_weight: 0.35,
    ready: true,
    readiness_threshold: 80,
    blocking_issues: [],
    checks: [
      {
        id: 'margins',
        name: 'Page margins (1")',
        category: 'layout',
        status: 'pass' as const,
        detail: 'All four margins are exactly 1".',
        suggestion: '',
        weight: 3,
        required: true,
      },
    ],
    summary: { passed: 8, warned: 0, failed: 0, paragraphs: 9 },
    ml: {
      available: true,
      score: 74.44,
      style: {
        score: 66.67,
        paragraphs_analyzed: 9,
        agreements: 6,
        mean_confidence: 0.8119,
        mismatches: [
          { text: 'Methodology', observed: 'heading2', predicted: 'paragraph' },
        ],
      },
      flow: {
        score: 86.1,
        transitions: 8,
        expected_next: 'paragraph',
        observed_next: 'paragraph',
        agrees: true,
      },
      unavailable_reason: null,
    },
    ...overrides,
  }
}

describe('auditCompliance', () => {
  beforeEach(() => {
    mockedAudit.mockReset()
  })

  it('passes content, layout, and requirements straight through to Python', async () => {
    mockedAudit.mockResolvedValue(pythonResponse() as never)

    await auditCompliance({
      content: '<h1>Introduction</h1><p>Body text here.</p>',
      pageSetup,
      requirements,
    })

    expect(mockedAudit).toHaveBeenCalledWith(
      '<h1>Introduction</h1><p>Body text here.</p>',
      pageSetup,
      requirements
    )
  })

  it('maps the snake_case Python payload onto camelCase for the client', async () => {
    mockedAudit.mockResolvedValue(pythonResponse() as never)

    const report = await auditCompliance({
      content: '<p>Body</p>',
      pageSetup,
      requirements,
    })

    expect(report.aggregateScore).toBe(91.05)
    expect(report.ruleScore).toBe(100)
    expect(report.mlScore).toBe(74.44)
    expect(report.readinessThreshold).toBe(80)
    expect(report.ready).toBe(true)
    expect(report.checks[0].required).toBe(true)
    expect(report.ml.style?.paragraphsAnalyzed).toBe(9)
    expect(report.ml.style?.mismatches[0].predicted).toBe('paragraph')
    expect(report.ml.flow?.expectedNext).toBe('paragraph')
  })

  it('reports a null ml score when the Tier 2 models are not installed', async () => {
    mockedAudit.mockResolvedValue(
      pythonResponse({
        ml_score: null,
        ml: {
          available: false,
          score: null,
          style: null,
          flow: null,
          unavailable_reason: 'No compliance model is installed.',
        },
      }) as never
    )

    const report = await auditCompliance({
      content: '<p>Body</p>',
      pageSetup,
      requirements,
    })

    expect(report.ml.available).toBe(false)
    expect(report.mlScore).toBeNull()
    expect(report.ml.style).toBeNull()
    expect(report.ml.unavailableReason).toBe('No compliance model is installed.')
  })

  it('surfaces blocking issues that prevent thesis readiness', async () => {
    mockedAudit.mockResolvedValue(
      pythonResponse({
        ready: false,
        blocking_issues: ['Page margins (1")', 'Page numbers'],
      }) as never
    )

    const report = await auditCompliance({
      content: '<p>Body</p>',
      pageSetup,
      requirements,
    })

    expect(report.ready).toBe(false)
    expect(report.blockingIssues).toEqual(['Page margins (1")', 'Page numbers'])
  })

  it('rejects empty document content before calling Python', async () => {
    await expect(
      auditCompliance({ content: '   ', pageSetup, requirements })
    ).rejects.toThrow('Document content is required')
    expect(mockedAudit).not.toHaveBeenCalled()
  })

  it('rejects an audit with no mandatory headings', async () => {
    await expect(
      auditCompliance({
        content: '<p>Body</p>',
        pageSetup,
        requirements: { ...requirements, mandatoryHeadings: [] },
      })
    ).rejects.toThrow('At least one mandatory heading is required')
    expect(mockedAudit).not.toHaveBeenCalled()
  })

  it('propagates Python service failures', async () => {
    mockedAudit.mockRejectedValue(new Error('ML service unavailable'))

    await expect(
      auditCompliance({ content: '<p>Body</p>', pageSetup, requirements })
    ).rejects.toThrow('ML service unavailable')
  })
})
