/**
 * Last-resort copy of unsaved edits, kept in this browser when a save fails or
 * the connection is down. It is offered back on the next open so nothing typed
 * before a failed save is lost.
 */

import type { JSONContent } from '@tiptap/core'

export interface LocalDraft {
  title: string
  content: string
  /** The editor's JSON of `content`, when it fitted in storage. */
  content_json?: JSONContent | null
  /** ISO time the draft was written. */
  savedAt: string
}

const draftKey = (documentId: string): string => `intellidocs.draft.${documentId}`

/** Keep the latest unsaved title and content for a document. Fails quietly if storage is full or blocked. */
export function writeLocalDraft(documentId: string, draft: Omit<LocalDraft, 'savedAt'>): void {
  const savedAt = new Date().toISOString()
  try {
    localStorage.setItem(draftKey(documentId), JSON.stringify({ ...draft, savedAt }))
  } catch {
    // Browser storage is small: when the JSON does not fit too, the HTML alone still saves the edits.
    try {
      if (!draft.content_json) return
      localStorage.setItem(draftKey(documentId), JSON.stringify({ title: draft.title, content: draft.content, savedAt }))
    } catch {
      /* storage unavailable: the server copy is all there is */
    }
  }
}

/** Read a stored draft, or null when none exists or it is unreadable. */
export function readLocalDraft(documentId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(documentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraft>
    if (typeof parsed.content !== 'string' || typeof parsed.savedAt !== 'string') return null
    const contentJson = parsed.content_json && typeof parsed.content_json === 'object' ? parsed.content_json : null
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      content: parsed.content,
      content_json: contentJson,
      savedAt: parsed.savedAt,
    }
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
