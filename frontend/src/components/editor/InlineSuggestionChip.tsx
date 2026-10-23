import { Check, ChevronLeft, ChevronRight, Crosshair, Sparkles, Users, X } from 'lucide-react'

export type SuggestionOrigin = 'learned' | 'preset' | 'ml' | 'scanner'

interface InlineSuggestionChipProps {
  /** Viewport-space anchor (top-left of the highlighted block). */
  anchor: { x: number; y: number }
  /** Display label, e.g. 'Heading 1'. */
  label: string
  /** Confidence percentage 0–100. */
  confidence: number
  /** One sentence on why this is suggested. */
  reason?: string
  /** Where the suggestion came from (drives the badge). */
  source?: SuggestionOrigin
  /** Whether the page currently shows the suggested look (After) or the original (Before). */
  previewMode?: 'before' | 'after'
  /** False for formats that cannot be drawn as a style (lists, quotes). */
  previewAvailable?: boolean
  onPreviewModeChange?: (mode: 'before' | 'after') => void
  /** 1-based position of the highlighted suggestion within the queue. */
  queuePosition?: number
  /** Total number of suggestions currently in the queue. */
  queueTotal?: number
  /** Label of the next alternative. */
  nextLabel?: string
  /** Label of the previous alternative. */
  prevLabel?: string
  /** How many other blocks share this suggestion's format group. */
  similarCount?: number
  /** Other blocks in the same group, shown as previews. */
  groupMembers?: Array<{ from: number; to: number; preview: string }>
  /** Apply the current format to every block in the group. */
  onAcceptAll?: () => void
  /** Cycle through alternative formats (1 = next, -1 = previous). */
  onChangeTo: (direction: 1 | -1) => void
  /** Scroll the editor to the highlighted target. */
  onJump: () => void
  onAccept: () => void
  onReject: () => void
}

const CARD_WIDTH = 300
/** Approximate card height, used to decide whether to flip below the anchor. */
const CARD_HEIGHT = 170
const EDGE_GAP = 8

const SOURCE_BADGE: Record<SuggestionOrigin, string> = {
  learned: 'Learned from you',
  preset: 'From your preset',
  ml: 'Suggested',
  scanner: 'Suggested',
}

/** Colour of the confidence bar: strong, medium, weak. */
function confidenceColor(confidence: number): string {
  if (confidence >= 70) return 'var(--success)'
  if (confidence >= 45) return 'var(--accent-strong)'
  return 'var(--error)'
}

/**
 * Compact suggestion card anchored to the highlighted block. It says what will
 * change, why, and how sure the model is. Ctrl+Enter applies, Esc dismisses, and
 * Alt+ArrowUp/Down cycles the "change to" alternatives.
 */
export default function InlineSuggestionChip({
  anchor,
  label,
  confidence,
  reason,
  source = 'scanner',
  previewMode = 'after',
  previewAvailable = false,
  onPreviewModeChange,
  queuePosition,
  queueTotal,
  nextLabel,
  prevLabel,
  similarCount,
  groupMembers,
  onAcceptAll,
  onChangeTo,
  onJump,
  onAccept,
  onReject,
}: InlineSuggestionChipProps): JSX.Element {
  const memberCount = groupMembers?.length ?? similarCount ?? 0
  const showGroup = Boolean(groupMembers && groupMembers.length > 0 && onAcceptAll)
  const flipBelow = anchor.y < CARD_HEIGHT + EDGE_GAP * 2

  // Keep the card fully inside the viewport horizontally.
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth
  const left = Math.min(Math.max(anchor.x - CARD_WIDTH / 2, EDGE_GAP), viewportWidth - CARD_WIDTH - EDGE_GAP)

  const percent = Math.round(confidence)

  return (
    <div
      role="dialog"
      aria-label={`Formatting suggestion: ${label}`}
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: flipBelow ? anchor.y + 44 : anchor.y - 12,
        left,
        width: CARD_WIDTH,
        transform: flipBelow ? 'none' : 'translateY(-100%)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        padding: '0.75rem',
        borderRadius: '0.75rem',
        backgroundColor: 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        boxShadow: '0 12px 32px var(--border-shadow)',
        fontSize: '0.75rem',
        userSelect: 'none',
      }}
    >
      {/* Header: what, and where it came from */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.625rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Sparkles style={{ width: 11, height: 11 }} />
            {SOURCE_BADGE[source]}
          </div>
          <div style={{ marginTop: '0.125rem', fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.25, wordBreak: 'break-word' }}>
            {label}
          </div>
        </div>
        <button
          type="button"
          title="Show in document"
          aria-label="Show in document"
          onMouseDownCapture={onJump}
          className="panel-icon-btn"
          style={{ flexShrink: 0 }}
        >
          <Crosshair style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Before / after on the page */}
      {onPreviewModeChange ? (
        previewAvailable ? (
          <div
            role="group"
            aria-label="Preview"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 2, borderRadius: '0.5rem', backgroundColor: 'var(--secondary)' }}
          >
            {(['before', 'after'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={previewMode === mode}
                onMouseDownCapture={() => onPreviewModeChange(mode)}
                style={{
                  height: 24,
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  backgroundColor: previewMode === mode ? 'var(--card)' : 'transparent',
                  color: previewMode === mode ? 'var(--foreground)' : 'var(--muted-foreground)',
                  boxShadow: previewMode === mode ? '0 1px 2px var(--border-shadow)' : 'none',
                }}
              >
                {mode === 'before' ? 'Before' : 'After'}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>Preview isn’t available for this change.</p>
        )
      ) : null}

      {/* Why + how sure */}
      {reason ? (
        <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>{reason}</p>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: 'var(--secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(4, percent))}%`, height: '100%', backgroundColor: confidenceColor(confidence) }} />
        </div>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{percent}% sure</span>
      </div>

      {/* Related blocks */}
      {showGroup && groupMembers ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--accent-strong)' }}>
            <Users style={{ width: 11, height: 11 }} />
            {memberCount + 1} similar blocks are styled differently
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxHeight: 64, overflowY: 'auto' }}>
            {groupMembers.map((member) => (
              <span
                key={`${member.from}-${member.to}`}
                style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.625rem', padding: '0.125rem 0.4rem', borderRadius: 999, backgroundColor: 'var(--secondary)', border: '1px solid var(--border)' }}
              >
                {member.preview}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <button type="button" title="Apply (Ctrl+Enter)" onMouseDownCapture={onAccept} style={primaryButton}>
          <Check style={{ width: 13, height: 13 }} strokeWidth={2.5} />
          Apply
          <kbd style={kbdStyle}>Ctrl+Enter</kbd>
        </button>
        {showGroup && onAcceptAll ? (
          <button type="button" title={`Apply to all ${memberCount + 1} similar blocks`} onMouseDownCapture={onAcceptAll} style={secondaryButton}>
            <Users style={{ width: 13, height: 13 }} />
            All {memberCount + 1}
          </button>
        ) : null}
        <button type="button" title="Dismiss (Esc)" onMouseDownCapture={onReject} style={secondaryButton}>
          <X style={{ width: 13, height: 13 }} strokeWidth={2.5} />
          Dismiss
        </button>
      </div>

      {/* Change-to stepper + queue position */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--muted-foreground)' }}>
          <button type="button" title={prevLabel ? `Change to ${prevLabel} (Alt+↑)` : 'Previous format (Alt+↑)'} aria-label="Previous format" onMouseDownCapture={() => onChangeTo(-1)} className="panel-icon-btn">
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <span style={{ fontSize: '0.6875rem' }}>Change format</span>
          <button type="button" title={nextLabel ? `Change to ${nextLabel} (Alt+↓)` : 'Next format (Alt+↓)'} aria-label="Next format" onMouseDownCapture={() => onChangeTo(1)} className="panel-icon-btn">
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {queueTotal && queueTotal > 1 ? (
          <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {queuePosition} of {queueTotal}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.3rem',
  height: 30,
  padding: '0 0.75rem',
  borderRadius: '0.5rem',
  border: 'none',
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  flex: 1,
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
}

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: 'var(--secondary)',
  color: 'var(--foreground)',
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.5625rem',
  padding: '0 0.25rem',
  borderRadius: 4,
  backgroundColor: 'color-mix(in srgb, var(--primary-foreground) 22%, transparent)',
}
