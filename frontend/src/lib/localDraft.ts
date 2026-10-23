/**
 * Last-resort copy of unsaved edits, kept in this browser when a save fails or
 * the connection is down. It is offered back on the next open so nothing typed
 * before a failed save is lost.
 */

export interface LocalDraft {
  title: string
  content: string
  /** ISO time the draft was written. */
  savedAt: string
}

const draftKey = (documentId: string): string => `intellidocs.draft.${documentId}`

/** Keep the latest unsaved title and content for a document. Fails quietly if storage is full or blocked. */
export function writeLocalDraft(documentId: string, draft: Omit<LocalDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(draftKey(documentId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
  } catch {
    /* storage unavailable: the server copy is all there is */
  }
}

/** Read a stored draft, or null when none exists or it is unreadable. */
export function readLocalDraft(documentId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(documentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraft>
    if (typeof parsed.content !== 'string' || typeof parsed.savedAt !== 'string') return null
    return { title: typeof parsed.title === 'string' ? parsed.title : '', content: parsed.content, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

/** Drop a document's stored draft (after a successful save, a restore or a discard). */
export function clearLocalDraft(documentId: string): void {
  try {
    localStorage.removeItem(draftKey(documentId))
  } catch {
    /* nothing to clean up */
  }
}
