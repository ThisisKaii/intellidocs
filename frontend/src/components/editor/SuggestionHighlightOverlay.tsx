/**
 * Editor-container-space box covering a suggested block in the document.
 * `SuggestionHighlightOverlay` draws this box as an overlay layer inside the
 * editor's scroll container — it is NOT part of the document content, so no
 * transaction/decorations are involved and it never appears in saved HTML.
 */
export interface HighlightBox {
  top: number
  left: number
  width: number
  height: number
}

interface SuggestionHighlightOverlayProps {
  /** Container-space box covering the suggested block (relative to the scroll container). */
  box: HighlightBox
  /** Wether the suggestion is currently active in the queue. */
  active?: boolean
  /** Fired when the user clicks the highlighted text. */
  onOpen: () => void
}

/**
 * Pulsing, dashed overlay that marks where formatting is suggested, rendered
 * inside the editor's scroll container (so it moves with the content and never
 * lags behind scrolling). Clicking it opens the suggestion popup.
 */
export default function SuggestionHighlightOverlay({
  box,
  active = true,
  onOpen,
}: SuggestionHighlightOverlayProps): JSX.Element {
  return (
    <>
      <style>{`
        .agentic-highlight-overlay {
          position: absolute;
          pointer-events: auto;
          border-radius: 6px;
          border: 2px dashed rgba(99, 102, 241, 0.85);
          background-color: rgba(99, 102, 241, 0.08);
          cursor: pointer;
          z-index: 820;
          box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25);
          animation: agenticOverlayPulse 2s ease-in-out infinite;
          transition: opacity 150ms ease;
        }
        .agentic-highlight-overlay:hover {
          background-color: rgba(99, 102, 241, 0.16);
        }
        @keyframes agenticOverlayPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.72; }
        }
      `}</style>
      <div
        className="agentic-highlight-overlay"
        style={{
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          opacity: active ? 1 : 0.35,
        }}
        title="Suggestion highlighted — click to show formatting actions"
        onMouseDownCapture={(event) => {
          // Prevent the editor from stealing focus so the caret stays put.
          event.preventDefault()
          onOpen()
        }}
        onClick={onOpen}
      />
    </>
  )
}