/**
 * Live sync between collaborators on a document channel.
 *
 * A save is announced, not carried: the message names the document state that was just saved, and
 * each collaborator fetches it from the server. A whole document (its HTML plus the editor's JSON,
 * hundreds of kilobytes for a long paper) would exceed Supabase Realtime's per-message limit, and a
 * notice stays a few dozen bytes however long the document grows.
 */

/** Broadcast on the `doc_sync` event after a save succeeds. */
export interface DocSyncNotice {
  /** `updated_at` of the saved row: the state collaborators should fetch. */
  updated_at: string
  sender_id: string
  timestamp: number
}

/** Whether a broadcast payload is a save notice. */
export function isDocSyncNotice(payload: unknown): payload is DocSyncNotice {
  if (!payload || typeof payload !== 'object') return false
  const candidate = payload as Partial<DocSyncNotice>
  return typeof candidate.updated_at === 'string' && typeof candidate.sender_id === 'string'
}

const time = (iso: string): number => {
  const value = new Date(iso).getTime()
  return Number.isNaN(value) ? 0 : value
}

/** Whether `updatedAt` is strictly newer than `than` (unreadable times count as oldest). */
export function isNewer(updatedAt: string, than: string | null): boolean {
  return than === null || time(updatedAt) > time(than)
}

/**
 * Fetch the saved document a notice announces. A read can briefly return the previous state (a
 * server cache not yet cleared), so an older copy is retried a few times, then given up on: the
 * next save's notice brings the collaborator up to date.
 */
export async function fetchAnnouncedDocument<T extends { updated_at: string }>(
  notice: DocSyncNotice,
  load: () => Promise<T>,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<T | null> {
  const attempts = options.attempts ?? 3
  const delayMs = options.delayMs ?? 600
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const doc = await load()
    if (time(doc.updated_at) >= time(notice.updated_at)) return doc
  }
  return null
}
