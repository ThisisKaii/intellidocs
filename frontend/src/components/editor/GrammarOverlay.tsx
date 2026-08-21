import { useEffect, useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, X } from 'lucide-react'
import type { GrammarIssue } from './GrammarPanel'

interface GrammarOverlayProps {
  issue: GrammarIssue | null
  anchorRect: DOMRect | null
  onApply: (issue: GrammarIssue) => void
  onDismiss: (issue: GrammarIssue) => void
  onClose: () => void
}

const POPOVER_WIDTH = 360
const POPOVER_OFFSET = 10

interface Position {
  top: number
  left: number
}

/** Place the popover below the anchor, flipping above when there is no room below. */
function computePosition(anchorRect: DOMRect, viewport: { width: number; height: number }): Position {
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2, 8),
    viewport.width - POPOVER_WIDTH - 8
  )

  const spaceBelow = viewport.height - anchorRect.bottom
  if (spaceBelow > 240) {
    return { top: anchorRect.bottom + POPOVER_OFFSET, left }
  }
  return { top: Math.max(anchorRect.top - POPOVER_OFFSET, 8), left }
}

/** Floating popover anchored to a clicked wavy-underline issue inside the editor. */
export default function GrammarOverlay({
  issue,
  anchorRect,
  onApply,
  onDismiss,
  onClose,
}: GrammarOverlayProps): JSX.Element | null {
  const [position, setPosition] = useState<Position>({ top: 8, left: 8 })

  useLayoutEffect(() => {
    if (!anchorRect) return
    setPosition(computePosition(anchorRect, { width: window.innerWidth, height: window.innerHeight }))
  }, [anchorRect])

  useEffect(() => {
    if (!issue) return
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [issue, onClose])

  if (!issue || !anchorRect) return null

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
          zIndex: 60,
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
          <AlertCircle style={{ width: '16px', height: '16px', color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>
            Grammar &amp; Spelling
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
        <div style={{ padding: '0.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.25rem',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              color: '#ea580c',
              marginBottom: '0.5rem',
            }}
          >
            {issue.type}
          </div>
          <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 0.5rem', color: 'var(--foreground)' }}>
            <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>{issue.original}</span>
            <span style={{ color: 'var(--muted-foreground)' }}> → </span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>{issue.suggestion}</span>
          </p>
          <p style={{ fontSize: '0.75rem', lineHeight: 1.45, margin: 0, color: 'var(--muted-foreground)' }}>
            {issue.explanation}
          </p>
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0.625rem 0.75rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => onDismiss(issue)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
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
            onClick={() => onApply(issue)}
            disabled={issue.actionable === false}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.375rem 0.75rem',
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
            {issue.actionable === false ? 'Review' : 'Apply'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
