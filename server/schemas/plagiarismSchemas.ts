import { z } from 'zod'

/** Validate the request to run a council scan for one submission. */
export const runPlagiarismScanSchema = z.object({
  documentId: z.string().trim().min(1, 'documentId is required'),
  folderId: z.string().trim().min(1, 'folderId is required'),
})

/** Validate one judge/verdict entry in a council transcript. */
export const councilVerdictSchema = z.object({
  match_id: z.string(),
  final_verdict: z.string(),
  overall_confidence: z.number(),
  active_judges: z.number().int().min(0),
  quorum_reached: z.boolean(),
  deliberation_transcript: z.array(z.record(z.unknown())).default([]),
  final_reasoning: z.string().default(''),
  recommended_action: z.string().default(''),
})

/** Composition metrics produced by the timeline forensics engine. */
export const matchCompositionSchema = z.object({
  session_duration_seconds: z.number().nonnegative(),
  total_characters: z.number().nonnegative(),
  paste_events: z.number().int().nonnegative(),
  typing_events: z.number().int().nonnegative(),
  avg_typing_speed_cps: z.number().nonnegative(),
  first_event: z.string().optional(),
  last_event: z.string().optional(),
})

/** Per-match timeline forensics returned by the Python council scan. */
export const pythonMatchForensicsSchema = z.object({
  timeline_verdict: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  priority_author: z.string().nullable().optional(),
  priority_timestamp: z.string().nullable().optional(),
  composition: matchCompositionSchema.nullable().optional(),
  doc_metadata: z.record(z.unknown()).nullable().optional(),
})

/** Validate one flagged match returned by the Python council scan. */
export const pythonCouncilScanMatchSchema = z.object({
  paragraph_index: z.number().int().min(0),
  char_start: z.number().int().min(0),
  char_end: z.number().int().min(0),
  matched_document_id: z.string().nullable().optional(),
  matched_student_id: z.string().nullable().optional(),
  similarity_score: z.number().min(0).max(100),
  match_type: z.string().min(1),
  match_severity: z.string().min(1),
  source_excerpt: z.string().nullable().optional(),
  target_excerpt: z.string().nullable().optional(),
  flagged_text: z.string(),
  council_verdict: councilVerdictSchema.nullable().optional(),
  forensics: pythonMatchForensicsSchema.nullable().optional(),
})

/** Validate council-scan responses returned by the Python service. */
export const pythonCouncilScanResponseSchema = z.object({
  matches: z.array(pythonCouncilScanMatchSchema),
  transcript: z.array(councilVerdictSchema),
  active_judges: z.number().int().min(0),
  quorum_reached: z.boolean(),
  peer_similarity_score: z.number().min(0).max(100),
  overall_originality_score: z.number().min(0).max(100),
  processing_time_ms: z.number().min(0),
})

export type CouncilVerdictPayload = z.infer<typeof councilVerdictSchema>
export type MatchComposition = z.infer<typeof matchCompositionSchema>
export type PythonMatchForensics = z.infer<typeof pythonMatchForensicsSchema>
export type PythonCouncilScanMatch = z.infer<typeof pythonCouncilScanMatchSchema>
export type PythonCouncilScanResponse = z.infer<typeof pythonCouncilScanResponseSchema>
