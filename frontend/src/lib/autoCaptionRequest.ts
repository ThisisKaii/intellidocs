/**
 * The ribbon's "Auto caption" button lives in the editor toolbar; the document page, which owns
 * the assistant panel, listens for this request and shows the caption card there.
 */
const AUTO_CAPTION_EVENT = 'intellidocs:auto-caption'

/** Ask the document page to show the "Auto caption" card. */
export function requestAutoCaption(): void {
  window.dispatchEvent(new CustomEvent(AUTO_CAPTION_EVENT))
}

/** Listen for "Auto caption" requests; returns the unsubscribe function. */
export function onAutoCaptionRequest(handler: () => void): () => void {
  window.addEventListener(AUTO_CAPTION_EVENT, handler)
  return () => window.removeEventListener(AUTO_CAPTION_EVENT, handler)
}
