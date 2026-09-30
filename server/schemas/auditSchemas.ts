import { z } from 'zod'

/** Validate the compliance-audit request body coming from the Express route. */
export const complianceAuditSchema = z.object({
  /** Document id is resolved to its content by the controller via the model layer. */
  documentId: z.string().trim().min(1, 'documentId is required'),
  /** Template rules the document is audited against. */
  mandatoryHeadings: z
    .array(z.string().trim().min(1))
    .max(30)
    .default([]),
  referenceStyle: z.enum(['apa', 'ieee']).default('apa'),
  requiredMarginInches: z.number().min(0.25).max(3).default(1),
  referencesRequired: z.boolean().default(true),
})

/** A single Tier 1 deterministic compliance check. */
export const pythonComplianceCheckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  status: z.enum(['pass', 'warn', 'fail']),
  detail: z.string(),
  suggestion: z.string().default(''),
  weight: z.number().default(1),
  required: z.boolean().default(false),
})

/** RandomForest paragraph-style consistency detail from Tier 2. */
export const pythonStyleConsistencySchema = z.object({
  score: z.number().min(0).max(100),
  paragraphs_analyzed: z.number().int().min(0),
  agreements: z.number().int().min(0),
  mean_confidence: z.number().min(0).max(1),
  classes: z.array(z.string()).optional(),
  mismatches: z
    .array(
      z.object({
        text: z.string(),
        observed: z.string(),
        predicted: z.string(),
      })
    )
    .default([]),
})

/** LSTM document-flow consistency detail from Tier 2. */
export const pythonFlowConsistencySchema = z.object({
  score: z.number().min(0).max(100),
  transitions: z.number().int().min(0),
  window: z.number().int().min(0).optional(),
  expected_next: z.string(),
  observed_next: z.string(),
  agrees: z.boolean(),
})

/** Validate the hybrid compliance report returned by the Python service. */
export const pythonComplianceAuditResponseSchema = z.object({
  aggregate_score: z.number().min(0).max(100),
  rule_score: z.number().min(0).max(100),
  /** Null when the Tier 2 models are not installed. */
  ml_score: z.number().min(0).max(100).nullable(),
  rule_weight: z.number().min(0).max(1),
  ml_weight: z.number().min(0).max(1),
  ready: z.boolean(),
  readiness_threshold: z.number().min(0).max(100),
  blocking_issues: z.array(z.string()),
  checks: z.array(pythonComplianceCheckSchema),
  summary: z.object({
    passed: z.number().int().min(0),
    warned: z.number().int().min(0),
    failed: z.number().int().min(0),
    paragraphs: z.number().int().min(0),
  }),
  ml: z.object({
    available: z.boolean(),
    score: z.number().min(0).max(100).nullable(),
    style: pythonStyleConsistencySchema.nullable(),
    flow: pythonFlowConsistencySchema.nullable(),
    unavailable_reason: z.string().nullable(),
  }),
})

export type ComplianceAuditInput = z.infer<typeof complianceAuditSchema>
export type PythonComplianceCheck = z.infer<typeof pythonComplianceCheckSchema>
export type PythonComplianceAuditResponse = z.infer<
  typeof pythonComplianceAuditResponseSchema
>
