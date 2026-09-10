import { useEffect, useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Sparkles, X } from 'lucide-react'
import type { GrammarIssue } from './GrammarPanel'
import { FORMAT_LABELS } from './SuggestionPanel'
import type { ScannerSuggestion } from '@/hooks/useAutoFormatScanner'

interface CollisionDropdownProps {
  /** The clicked grammar/spelling issue tied to this position. */
  issue: GrammarIssue
  /** A formatting suggestion occupying the same editor position, if any. */
  formatSuggestion: ScannerSuggestion | null
  /** Anchor rectangle the dropdown floats beneath. */
  anchorRect: DOMRect
  onApplyIssue: (issue: GrammarIssue) => void
  onDismissIssue: (issue: GrammarIssue) => void
  onApplyFormat: () => void
  onClose: () => void
}

const POPOVER_WIDTH = 360
const POPOVER_OFFSET = 10

interface Position {
  top: number
  left: number
}

/** Place the dropdown below the anchor, flipping above when there is no room below. */
function computePosition(anchorRect: DOMRect, viewport: { width: number; height: number }): Position {
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2, 8),
    viewport.width - POPOVER_WIDTH - 8
  )

  const spaceBelow = viewport.height - anchorRect.bottom
  if (spaceBelow > 260) {
    return { top: anchorRect.bottom + POPOVER_OFFSET, left }
  }
  return { top: Math.max(anchorRect.top - POPOVER_OFFSET, 8), left }
}

/**
 * Dropdown shown when a grammar click lands on a position also covered by an
 * active formatting suggestion, so both can be resolved without double tooltips.
 */
export default function CollisionDropdown({
  issue,
  formatSuggestion,
  anchorRect,
  onApplyIssue,
  onDismissIssue,
  onApplyFormat,
  onClose,
}: CollisionDropdownProps): JSX.Element {
  const [position, setPosition] = useState<Position>({ top: 8, left: 8 })

  useLayoutEffect(() => {
    setPosition(computePosition(anchorRect, { width: window.innerWidth, height: window.innerHeight }))
  }, [anchorRect])

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          zIndex: 61,
          width: POPOVER_WIDTH,
          maxWidth: 'calc(100vw - 1rem)',
          backgroundColor: 'var(--card)',
          borderRadius: '0.75rem',
          boxShadow:
            'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 8px 24px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 0.75rem',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
          }}
        >
          <AlertTriangle style={{ width: '16px', height: '16px', color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>
            Suggestions overlap
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Grammar / spelling resolution */}
          <div
            style={{
              padding: '0.625rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--secondary)',
            }}
          >
            <div
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: issue.kind === 'spelling' ? '#d97706' : '#dc2626',
                marginBottom: '0.375rem',
              }}
            >
              {issue.kind === 'spelling' ? 'Spelling' : 'Grammar'} — {issue.type}
            </div>
            <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 0.5rem', color: 'var(--foreground)' }}>
              <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>{issue.original}</span>
              <span style={{ color: 'var(--muted-foreground)' }}> → </span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>{issue.suggestion}</span>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onDismissIssue(issue)}
                style={{
                  flex: 1,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  padding: '0.375rem 0.625rem',
                  borderRadius: '0.375rem',
                  color: 'var(--muted-foreground)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Ignore
              </button>
              <button
                type="button"
                onClick={() => onApplyIssue(issue)}
                disabled={issue.actionable === false}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem',
                  flex: 1,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.375rem 0.625rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  border: 'none',
                  cursor: issue.actionable === false ? 'not-allowed' : 'pointer',
                  opacity: issue.actionable === false ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <Check style={{ width: '14px', height: '14px' }} />
                Apply fix
              </button>
            </div>
          </div>

          {/* Formatting suggestion resolution */}
          {formatSuggestion && (
            <div
              style={{
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                backgroundColor: 'rgba(99, 102, 241, 0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#6366f1',
                  marginBottom: '0.375rem',
                }}
              >
                <Sparkles style={{ width: '12px', height: '12px' }} />
                Formatting suggestion · {Math.round(formatSuggestion.confidence * 100)}%
              </div>
              <p style={{ fontSize: '0.8125rem', margin: '0 0 0.5rem', color: 'var(--foreground)' }}>
                Apply <strong>{FORMAT_LABELS[formatSuggestion.format] ?? formatSuggestion.format}</strong> here?
              </p>
              <button
                type="button"
                onClick={onApplyFormat}
                style={{
                  width: '100%',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.375rem 0.625rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--foreground)',
                  color: 'var(--background)',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Apply formatting
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}