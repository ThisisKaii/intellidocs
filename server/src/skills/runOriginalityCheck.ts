import { requestOriginalityCheck, type OriginalityPeer } from '../ai/bridge/pythonBridge'
import type { PythonOriginalityResponse } from '../../schemas/plagiarismSchemas'

/** A document row as needed for the originality comparison. */
interface OriginalityDocument {
  id: string
  title: string
  content: string
}

/**
 * Compare one document with the student's other documents through the ML
 * service. Nothing is stored; the result is returned to the caller as is.
 */
export async function runOriginalityCheck(input: {
  document: OriginalityDocument
  others: OriginalityDocument[]
}): Promise<PythonOriginalityResponse & { compared_documents: number }> {
  const peers: OriginalityPeer[] = input.others
    .filter((other) => other.id !== input.document.id && other.content)
    .map((other) => ({ documentId: other.id, title: other.title, text: other.content }))

  // With nothing to compare against, 0% means "not checked", not "original"; the count lets the page say so.
  if (peers.length === 0) return { overlap_percent: 0, passages: [], compared_documents: 0 }

  return { ...(await requestOriginalityCheck({ text: input.document.content, peers })), compared_documents: peers.length }
}
