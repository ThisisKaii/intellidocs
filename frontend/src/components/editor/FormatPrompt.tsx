import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Check, X, MapPin, ArrowRight } from 'lucide-react'
import { FORMAT_LABELS } from './SuggestionPanel'

export interface FormatSuggestion {
  format: string
  confidence: number
}

interface FormatPromptProps {
  suggestion: FormatSuggestion | null
  onAccept: (format: string) => void
  onReject: () => void
  /** Page number where the target suggestion lives (for off-screen "Jump to Page"). */
  targetPage?: number | null
  /** Whether the target is currently visible in the editor viewport. */
  isTargetInViewport?: boolean
  /** Called when user clicks "Jump to Page". */
  onJumpToPage?: (page: number) => void
  /** Preview text of the target block. */
  targetPreview?: string | null
}

/**
 * Floating agentic prompt that appears when the ML predictor suggests a format.
 *
 * Two modes:
 * 1. **In-viewport**: Shows "Apply format?" with Accept/Reject buttons near the
 *    highlighted target (standard behavior).
 * 2. **Off-screen**: Shows "Suggested Heading on Page X — [Jump to Page] [Dismiss]"
 *    so the user can jump to the target location.
 */
export default function FormatPrompt({
  suggestion,
  onAccept,
  onReject,
  targetPage,
  isTargetInViewport = true,
  onJumpToPage,
  targetPreview,
}: FormatPromptProps): JSX.Element {
  const showJumpMode = suggestion && !isTargetInViewport && targetPage && onJumpToPage

  return (
    <AnimatePresence>
      {suggestion && (
        <motion.div
          key={suggestion.format}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            pointerEvents: 'all',
            display: 'flex',
            flexDirection: targetPreview && !showJumpMode ? 'column' : 'row',
            alignItems: targetPreview && !showJumpMode ? 'stretch' : 'center',
            gap: '0.5rem',
            backgroundColor: 'var(--card)',
            boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.08) 0px 4px 12px, var(--card-shadow-inner) 0px 0px 0px 1px inset',
            borderRadius: '0.75rem',
            padding: '0.625rem 1rem',
            fontFamily: 'var(--font-sans)',
            maxWidth: '420px',
          }}
        >
          {/* Header row: icon + label + badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: targetPreview && !showJumpMode ? '100%' : undefined,
          }}>
            {/* Brain / MapPin icon */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: showJumpMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(121, 40, 202, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {showJumpMode ? (
                  <MapPin style={{ width: '16px', height: '16px', color: '#6366f1' }} />
                ) : (
                  <Brain style={{ width: '16px', height: '16px', color: '#7928ca' }} />
                )}
              </div>
              <span style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: showJumpMode ? '#6366f1' : '#7928ca',
                animation: showJumpMode ? 'none' : undefined,
              }} />
            </div>

          {/* Label */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {showJumpMode ? (
              <>
                <p style={{
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  margin: '0 0 0.125rem',
                  lineHeight: 1,
                }}>
                  Suggested on Page {targetPage}
                </p>
                <p style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  margin: 0,
                  letterSpacing: '-0.32px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {FORMAT_LABELS[suggestion.format] || suggestion.format}
                  {targetPreview && (
                    <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>
                      {' '}&mdash; &ldquo;{targetPreview}&hellip;&rdquo;
                    </span>
                  )}
                </p>
              </>
            ) : (
              <>
                <p style={{
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  margin: '0 0 0.125rem',
                  lineHeight: 1,
                }}>Apply format?</p>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  margin: 0,
                  letterSpacing: '-0.32px',
                }}>
                  {FORMAT_LABELS[suggestion.format] || suggestion.format}
                </p>
              </>
            )}
          </div>

          {/* Confidence badge */}
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: showJumpMode ? '#6366f1' : '#7928ca',
            backgroundColor: showJumpMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(121, 40, 202, 0.1)',
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
          }}>
            {suggestion.confidence}%
          </span>
          </div>

          {/* Diff preview — before/after */}
          {targetPreview && !showJumpMode && (
            <div style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              padding: '0.375rem 0.5rem',
              backgroundColor: 'rgba(0,0,0,0.03)',
              borderRadius: '6px',
              border: '1px solid rgba(0,0,0,0.06)',
              fontSize: '0.6875rem',
              lineHeight: 1.4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  color: 'var(--muted-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>Before</span>
                <span style={{
                  color: 'var(--foreground)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: 'line-through',
                  opacity: 0.6,
                }}>
                  {targetPreview}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  color: '#22c55e',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>After</span>
                <ArrowRight style={{ width: '10px', height: '10px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
                <span style={{
                  color: 'var(--foreground)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {FORMAT_LABELS[suggestion.format] || suggestion.format}: {targetPreview}
                </span>
              </div>
            </div>
          )}

          {showJumpMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              {/* Jump to Page button */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onJumpToPage!(targetPage!) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#6366f1',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 150ms',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
              >
                <MapPin style={{ width: '12px', height: '12px' }} /> Go to Page {targetPage}
              </button>

              {/* Dismiss button */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onReject() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: 'none',
                  boxShadow: 'var(--border-shadow) 0px 0px 0px 1px',
                  backgroundColor: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                <X style={{ width: '12px', height: '12px' }} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              {/* Accept button */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onAccept(suggestion.format) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
              >
                <Check style={{ width: '12px', height: '12px' }} /> Accept
              </button>

              {/* Reject button */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onReject() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  boxShadow: 'var(--border-shadow) 0px 0px 0px 1px',
                  backgroundColor: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
                }}
              >
                <X style={{ width: '12px', height: '12px' }} /> Reject
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
