import type { Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

/**
 * True for a transaction that applies changes from the shared Yjs document (another person's
 * edit, the first sync, or a collaborative undo), not something typed here.
 *
 * Plugins that tidy the document on their own (caption numbering, retiring guide hints, capping
 * image widths) skip these: the person who made the change already ran the same fix-up, and
 * running it again on every open copy would send the same edit back N times, or make two
 * screens of different widths fight over an image's size.
 */
export function isRemoteYjsChange(tr: Transaction): boolean {
  const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined
  return meta?.isChangeOrigin === true
}

/** True when any of these transactions is a local edit to the document. */
export function hasLocalDocChange(transactions: readonly Transaction[]): boolean {
  return transactions.some((tr) => tr.docChanged && !isRemoteYjsChange(tr))
}
