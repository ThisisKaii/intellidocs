import { Check, ChevronDown, ChevronUp, Locate, X } from 'lucide-react'

interface InlineSuggestionChipProps {
  /** Viewport-space anchor (top-left of the highlighted block). */
  anchor: { x: number; y: number }
  /** Display label, e.g. 'Heading 1'. */
  label: string
  /** Confidence percentage 0–100. */
  confidence: number
  /** 1-based position of the highlighted suggestion within the queue. */
  queuePosition?: number
  /** Total number of suggestions currently in the queue. */
  queueTotal?: number
  /** Label of the next alternative (tooltip only). */
  nextLabel?: string
  /** Label of the previous alternative (tooltip only). */
  prevLabel?: string
  /** Cycle through alternative formats (1 = next, -1 = previous). */
  onChangeTo: (direction: 1 | -1) => void
  /** Scroll the editor to the highlighted target. */
  onJump: () => void
  onAccept: () => void
  onReject: () => void
}

/**
 * Small inline chip anchored just above the highlighted block. Replaces the
 * floating bottom-bar prompt: the user sees the highlighted text plus a
 * compact action chip. Accept = Enter / ✓, reject = Esc / ✕, and
 * Alt+ArrowUp/Down cycles "change to" alternatives.
 */
export default function InlineSuggestionChip({
  anchor,
  label,
  confidence,
  queuePosition,
  queueTotal,
  nextLabel,
  prevLabel,
  onChangeTo,
  onJump,
  onAccept,
  onReject,
}: InlineSuggestionChipProps): JSX.Element {
  const chipStyle: React.CSSProperties = {
    position: 'fixed',
    top: anchor.y - 14,
    left: anchor.x,
    transform: 'translate(-50%, -100%)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '999px',
    backgroundColor: 'var(--card)',
    boxShadow: '0 0 0 1px var(--border-shadow), 0 8px 24px rgba(0,0,0,0.14)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    pointerEvents: 'auto',
    userSelect: 'none',
  }

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '999px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 150ms',
  }

  return (
    <div style={chipStyle} onMouseDown={(e) => e.preventDefault()}>
      <span style={{ color: 'var(--foreground)' }}>{label}</span>
      <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>{Math.round(confidence)}%</span>
      {queueTotal && queueTotal > 1 ? (
        <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {queuePosition}/{queueTotal}
        </span>
      ) : null}
      <span style={{ width: 1, height: 14, backgroundColor: 'var(--border)' }} />
      <button
        type="button"
        title="Go to highlighted text"
        style={buttonStyle}
        onMouseDownCapture={onJump}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <Locate style={{ width: 14, height: 14 }} />
      </button>
      <button
        type="button"
        title={prevLabel ? `Change to ${prevLabel} (Alt+ArrowUp)` : 'Change to previous format (Alt+ArrowUp)'}
        style={buttonStyle}
        onMouseDownCapture={() => onChangeTo(-1)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <ChevronUp style={{ width: 14, height: 14 }} />
      </button>
      <button
        type="button"
        title={nextLabel ? `Change to ${nextLabel} (Alt+ArrowDown)` : 'Change to next format (Alt+ArrowDown)'}
        style={buttonStyle}
        onMouseDownCapture={() => onChangeTo(1)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <ChevronDown style={{ width: 14, height: 14 }} />
      </button>
      <span style={{ width: 1, height: 14, backgroundColor: 'var(--border)' }} />
      <button
        type="button"
        title="Apply (Enter)"
        style={{ ...buttonStyle, color: '#10b981' }}
        onMouseDownCapture={onAccept}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(16,185,129,0.12)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <Check style={{ width: 14, height: 14 }} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        title="Dismiss (Esc)"
        style={{ ...buttonStyle, color: 'var(--muted-foreground)' }}
        onMouseDownCapture={onReject}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <X style={{ width: 14, height: 14 }} strokeWidth={2.5} />
      </button>
    </div>
  )
}