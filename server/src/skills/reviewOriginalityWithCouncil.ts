import { runCouncilScan } from './runCouncilScan'
import type { ScanDocument } from '../models/plagiarismModel'

/** Most flagged passages one review sends to the AI judges. */
export const MAX_REVIEWED_PASSAGES = 10

/** What the judges decided about one passage, in the student's words. */
export type PassageVerdict = 'original' | 'paraphrased' | 'reused' | 'inconclusive'

/** One judge's answer, so the student can see which model said what. */
export interface JudgeAnswer {
  judge: string
  provider: string
  model: string
  verdict: string
}

/** The council's review of one flagged passage. */
export interface PassageReview {
  paragraph_index: number
  text: string
  peer_document_id: string | null
  peer_title: string | null
  similarity: number
  verdict: PassageVerdict
  confidence: number
  reasoning: string
  judges: JudgeAnswer[]
}

/** Map the council's verdict wording onto the three outcomes shown to students. */
export function toPassageVerdict(finalVerdict: string): PassageVerdict {
  if (finalVerdict === 'plagiarism') return 'reused'
  if (finalVerdict === 'paraphrasing' || finalVerdict === 'uncited_fact') return 'paraphrased'
  if (finalVerdict === 'original') return 'original'
  return 'inconclusive'
}

/** Read a string field from a loosely typed transcript entry. */
function text(entry: Record<string, unknown>, key: string): string {
  const value = entry[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Ask the AI council to judge the strongest overlapping passages between a
 * student's document and their other documents. At most MAX_REVIEWED_PASSAGES
 * passages are sent, so one review stays cheap.
 */
export async function reviewOriginalityWithCouncil(input: {
  document: ScanDocument
  others: ScanDocument[]
}): Promise<{ reviews: PassageReview[]; activeJudges: number }> {
  const titles = new Map(input.others.map((other) => [other.id, other.title]))

  const result = await runCouncilScan({
    documentId: input.document.id,
    folderId: '',
    document: input.document,
    peers: input.others,
    timeline: [],
    maxMatches: MAX_REVIEWED_PASSAGES,
  })

  const reviews = result.matches.map((match): PassageReview => {
    const verdict = match.council_verdict
    const judges = (verdict?.deliberation_transcript ?? []).map((entry): JudgeAnswer => ({
      judge: text(entry, 'judge'),
      provider: text(entry, 'provider'),
      model: text(entry, 'model'),
      verdict: text(entry, 'verdict'),
    }))
    return {
      paragraph_index: match.paragraph_index,
      text: match.flagged_text,
      peer_document_id: match.matched_document_id ?? null,
      peer_title: match.matched_document_id ? titles.get(match.matched_document_id) ?? null : null,
      similarity: match.similarity_score,
      verdict: toPassageVerdict(verdict?.final_verdict ?? 'inconclusive'),
      confidence: verdict?.overall_confidence ?? 0,
      reasoning: verdict?.final_reasoning ?? '',
      judges,
    }
  })

  return { reviews, activeJudges: result.active_judges }
}
