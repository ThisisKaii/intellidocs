import {
  requestComplianceAudit,
  type CompliancePageSetup,
  type ComplianceRequirements,
} from '../ai/bridge/pythonBridge'
import type { ComplianceReport } from '../types/index'

/** Document layout plus the template rules to audit it against. */
export interface AuditComplianceInput {
  content: string
  pageSetup: CompliancePageSetup
  requirements: ComplianceRequirements
}

/**
 * Run the hybrid compliance audit for one document.
 *
 * Tier 1 deterministic rules always run in Python. Tier 2 style and flow
 * models are optional: when they are not trained, the report is returned with
 * `ml.available` false and an explanation, so the caller can say style was not
 * measured instead of presenting a rules-only score as a complete audit.
 */
export async function auditCompliance(
  input: AuditComplianceInput
): Promise<ComplianceReport> {
  if (!input.content.trim()) {
    throw new Error('Document content is required for a compliance audit')
  }

  if (!input.requirements.mandatoryHeadings.length) {
    throw new Error('At least one mandatory heading is required for a compliance audit')
  }

  const response = await requestComplianceAudit(
    input.content,
    input.pageSetup,
    input.requirements
  )

  return {
    aggregateScore: response.aggregate_score,
    ruleScore: response.rule_score,
    mlScore: response.ml_score,
    ruleWeight: response.rule_weight,
    mlWeight: response.ml_weight,
    ready: response.ready,
    readinessThreshold: response.readiness_threshold,
    blockingIssues: response.blocking_issues,
    summary: response.summary,
    checks: response.checks.map((check) => ({
      id: check.id,
      name: check.name,
      category: check.category,
      status: check.status,
      detail: check.detail,
      suggestion: check.suggestion,
      weight: check.weight,
      required: check.required,
    })),
    ml: {
      available: response.ml.available,
      score: response.ml.score,
      unavailableReason: response.ml.unavailable_reason,
      style: response.ml.style
        ? {
            score: response.ml.style.score,
            paragraphsAnalyzed: response.ml.style.paragraphs_analyzed,
            agreements: response.ml.style.agreements,
            meanConfidence: response.ml.style.mean_confidence,
            mismatches: response.ml.style.mismatches.map((mismatch) => ({
              text: mismatch.text,
              observed: mismatch.observed,
              predicted: mismatch.predicted,
            })),
          }
        : null,
      flow: response.ml.flow
        ? {
            score: response.ml.flow.score,
            transitions: response.ml.flow.transitions,
            expectedNext: response.ml.flow.expected_next,
            observedNext: response.ml.flow.observed_next,
            agrees: response.ml.flow.agrees,
          }
        : null,
    },
  }
}
