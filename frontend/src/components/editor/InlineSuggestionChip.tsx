import { Check, ChevronDown, ChevronUp, Locate, Users, X } from 'lucide-react'

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
  /** How many other blocks share this suggestion's format group. */
  similarCount?: number
  /** Other blocks in the same group, shown as previews in the cluster panel. */
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

/** Approximate compact chip height in px (padding + line-height). */
const CHIP_HEIGHT = 36

/** Approximate expanded cluster panel height in px. */
const CLUSTER_CHIP_HEIGHT = 190

/** Minimum space above the viewport to render the chip above its anchor. */
const MIN_SPACE_ABOVE = 48

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
  similarCount,
  groupMembers,
  onAcceptAll,
  onChangeTo,
  onJump,
  onAccept,
  onReject,
}: InlineSuggestionChipProps): JSX.Element {
  const memberCount = groupMembers?.length ?? similarCount ?? 0
  const showCluster = Boolean(groupMembers && groupMembers.length > 0 && onAcceptAll)
  const flipBelow = anchor.y < (showCluster ? CLUSTER_CHIP_HEIGHT : MIN_SPACE_ABOVE)

  const chipStyle: React.CSSProperties = {
    position: 'fixed',
    top: flipBelow ? anchor.y + CHIP_HEIGHT + 8 : anchor.y - 14,
    left: anchor.x,
    transform: flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    zIndex: 900,
    display: 'flex',
    flexWrap: showCluster ? 'wrap' : 'nowrap',
    alignItems: 'center',
    gap: showCluster ? '0.5rem' : '0.25rem',
    padding: showCluster ? '0.625rem 0.75rem' : '0.25rem 0.5rem',
    borderRadius: showCluster ? '0.75rem' : '999px',
    backgroundColor: 'var(--card)',
    boxShadow: '0 0 0 1.5px var(--accent-mid), 0 8px 24px var(--border-shadow)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    whiteSpace: showCluster ? 'normal' : 'nowrap',
    maxWidth: showCluster ? '420px' : undefined,
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

  const clusterBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: '0.3rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    color: 'var(--accent-strong)',
    backgroundColor: 'color-mix(in srgb, var(--accent-strong) 10%, transparent)',
    padding: '0.125rem 0.5rem',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  }

  const memberPillStyle: React.CSSProperties = {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.625rem',
    fontWeight: 500,
    color: 'var(--foreground)',
    backgroundColor: 'var(--secondary)',
    border: '1px solid var(--border)',
    padding: '0.125rem 0.4rem',
    borderRadius: '999px',
  }

  const applyAllStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    height: '28px',
    padding: '0 0.75rem',
    borderRadius: '0.5rem',
    border: 'none',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={chipStyle} onMouseDown={(e) => e.preventDefault()}>
      <span style={{ color: 'var(--foreground)' }}>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: '0.6875rem',
          fontWeight: 700,
          padding: '0.1rem 0.4rem',
          borderRadius: '999px',
          backgroundColor: confidence >= 70 ? 'color-mix(in srgb, var(--highlight) 60%, transparent)' : confidence >= 45 ? 'color-mix(in srgb, var(--selection) 60%, transparent)' : 'color-mix(in srgb, var(--error) 12%, transparent)',
          color: confidence >= 70 ? 'var(--text-primary)' : confidence >= 45 ? 'var(--text-primary)' : 'var(--error)',
        }}
      >
        {Math.round(confidence)}%
      </span>
      {queueTotal && queueTotal > 1 ? (
        <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {queuePosition}/{queueTotal}
        </span>
      ) : null}
      {!showCluster && memberCount > 0 ? (
        onAcceptAll ? (
          <button
            type="button"
            title={`Apply to all ${memberCount + 1} similar blocks`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '0.1rem 0.45rem',
              borderRadius: '999px',
              border: 'none',
              backgroundColor: 'color-mix(in srgb, var(--accent-strong) 12%, transparent)',
              color: 'var(--accent-strong)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background-color 150ms',
            }}
            onMouseDownCapture={onAcceptAll}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'color-mix(in srgb, var(--accent-strong) 22%, transparent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'color-mix(in srgb, var(--accent-strong) 12%, transparent)' }}
          >
            <Users style={{ width: 11, height: 11 }} />
            +{memberCount}
          </button>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '0.1rem 0.45rem',
              borderRadius: '999px',
              backgroundColor: 'color-mix(in srgb, var(--accent-strong) 12%, transparent)',
              color: 'var(--accent-strong)',
            }}
          >
            <Users style={{ width: 11, height: 11 }} />
            +{memberCount}
          </span>
        )
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
        style={{ ...buttonStyle, color: 'var(--primary)' }}
        onMouseDownCapture={onAccept}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'color-mix(in srgb, var(--highlight) 50%, transparent)' }}
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

      {showCluster && groupMembers ? (
        <div
          style={{
            flexBasis: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            minWidth: 0,
          }}
        >
          <span style={clusterBadgeStyle}>
            <Users style={{ width: 11, height: 11 }} />
            Found {memberCount + 1} related blocks with inconsistent styling
          </span>
          <p
            style={{
              margin: 0,
              fontSize: '0.6875rem',
              fontWeight: 400,
              lineHeight: 1.35,
              color: 'var(--muted-foreground)',
            }}
          >
            Do these serve the same role? Apply standard formatting to all items in this group:
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.25rem',
              maxHeight: '88px',
              overflowY: 'auto',
            }}
          >
            {groupMembers.map((member) => (
              <span key={`${member.from}-${member.to}`} style={memberPillStyle}>
                {member.preview}
              </span>
            ))}
          </div>
          <button type="button" style={applyAllStyle} onMouseDownCapture={onAcceptAll}>
            <Check style={{ width: 13, height: 13 }} strokeWidth={2.5} />
            Apply to All ({memberCount + 1} items)
          </button>
        </div>
      ) : null}
    </div>
  )
}