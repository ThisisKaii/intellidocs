/**
 * The selection toolbar's "Find citations" button lives deep in the editor canvas;
 * the document page, which owns the assistant panel, listens for this request.
 */
const FIND_CITATIONS_EVENT = 'intellidocs:find-citations'

/** Ask the document page to search sources for the selected text. */
export function requestFindCitations(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(FIND_CITATIONS_EVENT, { detail: text }))
}

/** Listen for "Find citations" requests; returns the unsubscribe function. */
export function onFindCitationsRequest(handler: (text: string) => void): () => void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') handler(event.detail)
  }
  window.addEventListener(FIND_CITATIONS_EVENT, listener)
  return () => window.removeEventListener(FIND_CITATIONS_EVENT, listener)
}
