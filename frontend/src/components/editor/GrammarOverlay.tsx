import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, X } from 'lucide-react'
import { autoUpdate, computePosition, flip, hide, offset, shift, type VirtualElement } from '@floating-ui/dom'
import type { GrammarIssue } from './GrammarPanel'

interface GrammarOverlayProps {
  issue: GrammarIssue | null
  /**
   * The underlined text's box right now, or null when it can no longer be found. Called on every
   * scroll, resize, zoom and layout change, so the popover stays attached to the text.
   */
  getAnchorRect: (() => DOMRect | null) | null
  /** The scroll container the text lives in (the editor), so its scrolling moves the popover. */
  contextElement?: Element | null
  onApply: (issue: GrammarIssue, suggestion: string) => void
  onDismiss: (issue: GrammarIssue) => void
  onClose: () => void
}

const POPOVER_WIDTH = 360

interface Position {
  top: number
  left: number
  /** The underlined text is scrolled out of view: the popover waits, hidden, until it is back. */
  hidden: boolean
}

/**
 * Floating popover anchored to a clicked wavy-underline issue inside the editor.
 *
 * Positioned with Floating UI (as TipTap's BubbleMenu is): below the text, flipping above with its
 * own height taken into account when there is no room, shifted to stay on screen, and kept in
 * place by autoUpdate while the page scrolls, zooms or reflows.
 */
export default function GrammarOverlay({
  issue,
  getAnchorRect,
  contextElement,
  onApply,
  onDismiss,
  onClose,
}: GrammarOverlayProps): JSX.Element | null {
  const [position, setPosition] = useState<Position>({ top: -9999, left: -9999, hidden: true })
  const floatingRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!issue || !getAnchorRect || !floating) return
    let lastRect = new DOMRect(0, 0, 0, 0)
    const reference: VirtualElement = {
      getBoundingClientRect: () => {
        lastRect = getAnchorRect() ?? lastRect
        return lastRect
      },
      contextElement: contextElement ?? undefined,
    }
    const update = (): void => {
      void computePosition(reference, floating, {
        placement: 'bottom',
        strategy: 'fixed',
        middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), hide()],
      }).then(({ x, y, middlewareData }) => {
        setPosition({ top: y, left: x, hidden: Boolean(middlewareData.hide?.referenceHidden) })
      })
    }
    // animationFrame: canvas zoom and pagination move the text without a scroll or resize event.
    return autoUpdate(reference, floating, update, { animationFrame: true })
  }, [issue, getAnchorRect, contextElement])

  useEffect(() => {
    if (!issue) return
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [issue, onClose])

  if (!issue || !getAnchorRect) return null

  return (
    <AnimatePresence>
      <motion.div
        ref={floatingRef}
        data-testid="grammar-popover"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          visibility: position.hidden ? 'hidden' : 'visible',
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
          <AlertCircle style={{ width: '16px', height: '16px', color: 'var(--error)', flexShrink: 0 }} />
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
              backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)',
              color: 'var(--warning)',
              marginBottom: '0.5rem',
            }}
          >
            {issue.type}
          </div>
          <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 0.5rem', color: 'var(--foreground)' }}>
            <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>{issue.original}</span>
          </p>

          {/* Spelling issues with multiple plausible candidates offer a pick-list. */}
          {(issue.suggestions ?? []).length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.5rem' }}>
              {(issue.suggestions ?? []).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onApply(issue, option)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    color: 'var(--success)',
                    backgroundColor: 'color-mix(in srgb, var(--success) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 0.5rem', color: 'var(--foreground)' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>→ </span>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>{issue.suggestion}</span>
            </p>
          )}

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
            onClick={() => onApply(issue, issue.suggestion)}
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
