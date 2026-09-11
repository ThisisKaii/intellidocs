import { Sparkles, SpellCheck2 } from 'lucide-react'

interface SuggestionActionsMenuProps {
  /** Viewport-space anchor (top-left of the highlighted block). */
  anchor: { x: number; y: number }
  /** Label of the active formatting suggestion. */
  formattingLabel: string
  /** Number of grammar/spelling issues found on the highlighted line. */
  grammarCount: number
  onFormatting: () => void
  onGrammar: () => void
  onClose: () => void
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: 'none',
  borderRadius: '0.375rem',
  backgroundColor: 'transparent',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 120ms',
}

/**
 * Dropdown shown above a highlighted line when it carries BOTH a formatting
 * suggestion and grammar/spelling issues. Lets the user pick which suggestion
 * type to act on before the corresponding popover opens.
 */
export default function SuggestionActionsMenu({
  anchor,
  formattingLabel,
  grammarCount,
  onFormatting,
  onGrammar,
  onClose,
}: SuggestionActionsMenuProps): JSX.Element {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 940,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          left: anchor.x,
          top: anchor.y - 8,
          transform: 'translate(-50%, -100%)',
          zIndex: 950,
          minWidth: 220,
          backgroundColor: 'var(--card)',
          borderRadius: '0.5rem',
          boxShadow: '0 0 0 1px var(--border-shadow), 0 8px 24px rgba(0,0,0,0.16)',
          padding: '0.375rem',
        }}
      >
        <div
          style={{
            padding: '0.3125rem 0.5rem',
            fontSize: '0.65625rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
          }}
        >
          Suggestions on this line
        </div>
        <button
          type="button"
          style={itemStyle}
          onClick={onFormatting}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
        >
          <Sparkles style={{ width: '14px', height: '14px', color: '#6366f1', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Formatting · {formattingLabel}
          </span>
        </button>
        {grammarCount > 0 ? (
          <button
            type="button"
            style={itemStyle}
            onClick={onGrammar}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >
            <SpellCheck2 style={{ width: '14px', height: '14px', color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Grammar &amp; spelling · {grammarCount}
            </span>
          </button>
        ) : null}
      </div>
    </>
  )
}