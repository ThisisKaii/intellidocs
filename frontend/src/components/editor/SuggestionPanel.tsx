import { motion, AnimatePresence } from 'framer-motion'
import { Brain, X } from 'lucide-react'

/** Format labels for display. */
const FORMAT_LABELS: Record<string, string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  blockquote: 'Blockquote',
  unordered_list: 'Bullet List',
  ordered_list: 'Numbered List',
  ul: 'Bullet List',
  ol: 'Numbered List',
  code_block: 'Code Block',
}

export interface Suggestion {
  format: string
  confidence: number
  reason: string
}

interface SuggestionPanelProps {
  suggestions: Suggestion[]
  onApply: (format: string) => void
  onDismiss: () => void
}

/** ML Predictions card shown in the right panel. */
export default function SuggestionPanel({ suggestions, onApply, onDismiss }: SuggestionPanelProps): JSX.Element | null {
  if (!suggestions || suggestions.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: 'transparent',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          boxShadow: 'var(--border-shadow) 0px 0px 0px 1px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--secondary)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Brain style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} />
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
            }}>
              ML Predictions
            </span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onDismiss() }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem',
              borderRadius: '0.25rem',
              transition: 'background-color 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--background)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
            }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        {/* Suggestions list */}
        <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onApply(s.format)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 150ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <div style={{
                flexShrink: 0,
                width: '32px',
                height: '32px',
                borderRadius: '0.375rem',
                backgroundColor: 'rgba(121, 40, 202, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', fontWeight: 700, color: '#7928ca' }}>
                  {s.confidence}%
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  margin: '0 0 0.125rem',
                  letterSpacing: '-0.01em',
                }}>
                  {FORMAT_LABELS[s.format] || s.format}
                </p>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {s.reason}
                </p>
              </div>

              <div style={{
                width: '64px',
                height: '6px',
                backgroundColor: 'var(--border)',
                borderRadius: '9999px',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#7928ca',
                    borderRadius: '9999px',
                    transition: 'width 300ms ease',
                    width: `${s.confidence}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontStyle: 'italic', margin: 0 }}>
            Learned from your formatting history
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export { FORMAT_LABELS }
