import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

export type ComplianceStatus = 'pass' | 'warn' | 'fail'

export interface ComplianceCheck {
  id: string
  name: string
  category: string
  status: ComplianceStatus
  detail: string
  suggestion: string
  weight: number
  required: boolean
}

export interface ComplianceReport {
  aggregateScore: number
  ruleScore: number
  mlScore: number | null
  ruleWeight: number
  mlWeight: number
  ready: boolean
  readinessThreshold: number
  blockingIssues: string[]
  summary: {
    passed: number
    warned: number
    failed: number
    paragraphs: number
  }
  checks: ComplianceCheck[]
  ml: {
    available: boolean
    score: number | null
    unavailableReason: string | null
    style: {
      score: number
      paragraphsAnalyzed: number
      agreements: number
      meanConfidence: number
      mismatches: { text: string; observed: string; predicted: string }[]
    } | null
    flow: {
      score: number
      transitions: number
      expectedNext: string
      observedNext: string
      agrees: boolean
    } | null
  }
}

const STATUS_STYLES: Record<ComplianceStatus, { text: string; bg: string; Icon: typeof CheckCircle2 }> = {
  pass: { text: 'text-green-700', bg: 'bg-green-50', Icon: CheckCircle2 },
  warn: { text: 'text-yellow-700', bg: 'bg-yellow-50', Icon: AlertTriangle },
  fail: { text: 'text-red-700', bg: 'bg-red-50', Icon: XCircle },
}

const CATEGORY_LABELS: Record<string, string> = {
  layout: 'Page Layout',
  structure: 'Document Structure',
  style: 'Writing Style',
  references: 'References',
  content: 'Required Sections',
}

/** Return the Tailwind text colour for a score on the 0-100 scale. */
function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

/**
 * Display a hybrid compliance audit report.
 *
 * The score breakdown shows how the aggregate was reached: deterministic rules
 * contribute a fixed weight and the learned style tier the rest. When the
 * learned tier is unavailable that is stated explicitly, because a rules-only
 * score is not the same thing as a clean document.
 */
export default function ThesisChecklist({ report }: { report: ComplianceReport }) {
  const { summary, ml } = report
  const grouped = report.checks.reduce<Record<string, ComplianceCheck[]>>((accumulator, check) => {
    const key = check.category
    accumulator[key] = accumulator[key] ?? []
    accumulator[key].push(check)
    return accumulator
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border p-4">
        <div>
          <div className={`text-3xl font-bold ${scoreColor(report.aggregateScore)}`}>
            {Math.round(report.aggregateScore)}%
          </div>
          <p className="text-sm font-semibold">Thesis Readiness</p>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Rule compliance:</span>{' '}
            <span className={scoreColor(report.ruleScore)}>{Math.round(report.ruleScore)}%</span>
            <span className="text-muted-foreground"> (weight {Math.round(report.ruleWeight * 100)}%)</span>
          </p>
          <p>
            <span className="font-medium">Stylistic consistency:</span>{' '}
            {ml.available && report.mlScore !== null ? (
              <span className={scoreColor(report.mlScore)}>{Math.round(report.mlScore)}%</span>
            ) : (
              <span className="text-muted-foreground">not measured</span>
            )}
            <span className="text-muted-foreground"> (weight {Math.round(report.mlWeight * 100)}%)</span>
          </p>
          <p className="text-muted-foreground">
            {summary.passed} passed · {summary.warned} warnings · {summary.failed} failed across{' '}
            {summary.paragraphs} blocks
          </p>
        </div>

        <div className="ml-auto">
          {report.ready ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Ready for submission
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              <XCircle className="h-4 w-4" /> Not ready
            </span>
          )}
        </div>
      </div>

      {!ml.available && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Only the deterministic rules ran. {ml.unavailableReason ?? 'The learned style models are unavailable.'}
          </span>
        </div>
      )}

      {report.blockingIssues.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Blocking issues must be fixed before submission:</p>
          <ul className="mt-1 list-inside list-disc">
            {report.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {ml.available && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ml.style && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Paragraph style consistency</p>
              <p className={scoreColor(ml.style.score)}>{Math.round(ml.style.score)}%</p>
              <p className="text-muted-foreground">
                {ml.style.agreements} of {ml.style.paragraphsAnalyzed} blocks match their predicted
                style (mean model confidence {(ml.style.meanConfidence * 100).toFixed(1)}%)
              </p>
              {ml.style.mismatches.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {ml.style.mismatches.slice(0, 3).map((mismatch, index) => (
                    <li key={index}>
                      &ldquo;{mismatch.text}&rdquo; marked as {mismatch.observed}, model expects{' '}
                      {mismatch.predicted}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {ml.flow && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Document flow</p>
              <p className={scoreColor(ml.flow.score)}>{Math.round(ml.flow.score)}%</p>
              <p className="text-muted-foreground">
                The sequence model expects &ldquo;{ml.flow.expectedNext}&rdquo; next and the document
                uses &ldquo;{ml.flow.observedNext}&rdquo;{ml.flow.agrees ? ' — flow matches' : ' — flow diverges'}.
              </p>
            </div>
          )}
        </div>
      )}

      {Object.entries(grouped).map(([category, checks]) => (
        <div key={category}>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            {CATEGORY_LABELS[category] ?? category}
          </h4>
          <ul className="space-y-2">
            {checks.map((check, index) => {
              const { text, bg, Icon } = STATUS_STYLES[check.status]
              return (
                <li
                  key={`${check.id}-${check.name}-${index}`}
                  className={`flex items-start gap-2 rounded-md p-2 text-sm ${bg}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${text}`} />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {check.name}
                      {check.required && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">required</span>
                      )}
                    </p>
                    <p className="text-muted-foreground">{check.detail}</p>
                    {check.suggestion && check.status !== 'pass' && (
                      <p className={`mt-1 text-xs ${text}`}>{check.suggestion}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
