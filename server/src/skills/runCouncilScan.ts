import {
  requestCouncilScan,
  type CouncilScanPeer,
  type CouncilAIConfig,
} from '../ai/bridge/pythonBridge'
import { getAIProfiles, resolveJudgeAssignments } from '../ai/aiProfiles'
import type { PythonCouncilScanResponse } from '../../schemas/plagiarismSchemas'
import type { ScanDocument } from '../models/plagiarismModel'

/**
 * AI profiles and judge assignments from the server environment, forwarded to
 * the council so each judge can run on a different provider. When no AI is
 * configured the list is empty and the ML service uses its own environment.
 */
function councilAIConfig(): CouncilAIConfig {
  try {
    const profiles = getAIProfiles()
    return {
      profiles: profiles.map(({ provider, apiKeys, model }) => ({ provider, apiKeys, model })),
      assignments: resolveJudgeAssignments(profiles.length),
    }
  } catch {
    return { profiles: [], assignments: {} }
  }
}

/**
 * Run the ML council scan for one document against the folder's peer
 * documents. The ML service runs the triage funnel plus the 5-judge council
 * and returns verdicts, flagged matches, and timeline forensics.
 */
export async function runCouncilScan(input: {
  documentId: string
  folderId: string
  document: ScanDocument
  peers: ScanDocument[]
  /** Raw behavior events for the timeline forensics engine. */
  timeline: unknown[]
  /** Review only the N strongest flagged passages with the AI judges. */
  maxMatches?: number
}): Promise<PythonCouncilScanResponse> {
  const peerPayload: CouncilScanPeer[] = input.peers.map((peer) => ({
    documentId: peer.id,
    userId: peer.user_id,
    text: peer.content,
  }))

  return requestCouncilScan({
    documentId: input.documentId,
    userId: input.document.user_id,
    folderId: input.folderId,
    text: input.document.content,
    peers: peerPayload,
    timeline: input.timeline,
    maxMatches: input.maxMatches,
    ai: councilAIConfig(),
  })
}
