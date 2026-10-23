/** Type definitions for the Academic Integrity Council & Plagiarism Detection system. */

import type { PlagiarismScanDetail } from '@/services/api'

export type MatchType = 
  | 'verbatim' 
  | 'paraphrased' 
  | 'uncited_fact' 
  | 'external_source' 
  | 'original'

export type MatchSeverity = 
  | 'low' 
  | 'medium' 
  | 'high' 
  | 'critical'

export interface PlagiarismMatch {
  match_id: string
  paragraph_index: number
  char_start: number
  char_end: number
  matched_document_id: string | null
  matched_student_id: string | null
  similarity_score: number
  match_type: MatchType
  match_severity: MatchSeverity
  source_excerpt: string | null
  target_excerpt: string | null
  timeline_verdict: string | null
  flagged_text: string
  council_verdict: CouncilMatchVerdict | null
  composition_analysis?: CompositionAnalysis
  doc_metadata?: DocumentMetadata
  priority_author?: string | null
  priority_timestamp?: string | null
}

export interface CouncilMatchVerdict {
  final_verdict: string
  overall_confidence: number
  active_judges: number
  quorum_reached: boolean
  deliberation_transcript: DeliberationEntry[]
  final_reasoning: string
  recommended_action: string
  /** Timeline forensics attached to this match, when computed. */
  forensics?: MatchForensics | null
}

/** How the author's composition timeline scored for one match. */
export interface MatchForensics {
  timeline_verdict: string
  confidence: number
  evidence: string[]
  priority_author?: string | null
  priority_timestamp?: string | null
  composition?: CompositionAnalysis | null
  doc_metadata?: Record<string, unknown> | null
}

export interface DeliberationEntry {
  judge: string
  verdict?: string
  confidence?: number
  reasoning?: string
  evidence?: string[]
  severity?: MatchSeverity
  synthesis?: boolean
  /** AI backend that produced this entry (council runs a different model per judge). */
  provider?: string
  model?: string
}

export interface CouncilVerdict {
  match_id: string
  final_verdict: string
  overall_confidence: number
  active_judges: number
  quorum_reached: boolean
  deliberation_transcript: DeliberationEntry[]
  final_reasoning: string
  recommended_action: string
}

export interface CouncilInspectionProps {
  isOpen: boolean
  onClose: () => void
  /** The scan, its matches, and the document title to inspect. */
  detail: PlagiarismScanDetail | null
}

export interface CompositionAnalysis {
  total_characters: number
  paste_events: number
  typing_events: number
  avg_typing_speed_cps: number
  session_duration_seconds: number
  first_event?: string
  last_event?: string
}

export interface DocumentMetadata {
  created_at: string | null
  modified_at: string | null
  last_modified_by: string | null
  revision_count: number
  total_edit_time_minutes: number
  word_count: number
  character_count: number
  paragraph_count: number
}