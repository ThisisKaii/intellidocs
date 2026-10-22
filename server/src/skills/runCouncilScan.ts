import {
  requestCouncilScan,
  type CouncilScanPeer,
  type CouncilAIConfig,
} from '../ai/bridge/pythonBridge'
import type { PythonCouncilScanResponse } from '../../schemas/plagiarismSchemas'
import type { ScanDocument } from '../models/plagiarismModel'

/** AI provider details from the server environment, forwarded to the council. */
function councilAIConfig(): CouncilAIConfig {
  return {
    provider: process.env.AI_PROVIDER ?? null,
    apiKey: process.env.AI_API_KEY ?? null,
    model: process.env.AI_MODEL ?? null,
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
    ai: councilAIConfig(),
  })
}
