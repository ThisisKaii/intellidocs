/** What the user decided about a suggestion. */
export type SuggestionDecision = 'accepted' | 'dismissed'

const STORAGE_PREFIX = 'intellidocs.suggestionMemory.'
// A document that is edited for years must not grow its memory without bound.
const MAX_REMEMBERED = 500

type Memory = Record<string, SuggestionDecision>

/** Read the remembered decisions of a document; empty when storage is unavailable. */
export function loadSuggestionMemory(documentId: string | undefined): Memory {
  if (!documentId) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + documentId)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Memory) : {}
  } catch {
    return {}
  }
}

/**
 * Remember one decision. The key is built from the block's text and the format
 * (see the scanner's contentKey), so the suggestion stays quiet until the
 * block's text changes.
 */
export function rememberSuggestion(
  documentId: string | undefined,
  key: string,
  decision: SuggestionDecision,
): void {
  if (!documentId) return
  try {
    const memory = loadSuggestionMemory(documentId)
    delete memory[key]
    memory[key] = decision
    const keys = Object.keys(memory)
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete memory[stale]
    window.localStorage.setItem(STORAGE_PREFIX + documentId, JSON.stringify(memory))
  } catch {
    // Storage can be full or blocked; the suggestion simply is not remembered.
  }
}
