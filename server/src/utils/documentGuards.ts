/** Title a document carries before the user renames it (also the client's unloaded default). */
export const DEFAULT_DOCUMENT_TITLE = 'Untitled Document'

/** Whether editor HTML holds no visible text and no embedded media/tables. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text === '' && !/<(img|table|hr|iframe|video)\b/i.test(html)
}

/**
 * Detect the signature of a client saving its uninitialised state over a real
 * document: the update blanks the content AND resets a renamed document back to
 * the default title. A user clearing a document keeps its title, so this never
 * blocks that; it only stops the data-loss pattern where a page saved before
 * the document had finished loading.
 */
export function isDestructiveBlankOverwrite(
  existing: { title: string; content: string },
  update: { title?: string; content?: string },
): boolean {
  if (update.content === undefined || !isBlankHtml(update.content)) return false
  if (isBlankHtml(existing.content)) return false
  return update.title === DEFAULT_DOCUMENT_TITLE && existing.title !== DEFAULT_DOCUMENT_TITLE
}
