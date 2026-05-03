import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Check, X } from 'lucide-react'
import { FORMAT_LABELS } from './SuggestionPanel'

export interface FormatSuggestion {
  format: string
  confidence: number
}

interface FormatPromptProps {
  suggestion: FormatSuggestion | null
  onAccept: (format: string) => void
  onReject: () => void
}

/**
 * Floating YES/NO prompt that appears when the ML predictor is confident
 * enough to suggest a format. Positioned near the bottom of the editor.
 */
export default function FormatPrompt({ suggestion, onAccept, onReject }: FormatPromptProps): JSX.Element {
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
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: 'var(--card)',
            boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.08) 0px 4px 12px, var(--card-shadow-inner) 0px 0px 0px 1px inset',
            borderRadius: '0.75rem',
            padding: '0.625rem 1rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Brain icon with pulse */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(121, 40, 202, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Brain style={{ width: '16px', height: '16px', color: '#7928ca' }} />
            </div>
            <span style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#7928ca',
            }} />
          </div>

          {/* Label */}
          <div style={{ flex: 1, minWidth: 0 }}>
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
          </div>

          {/* Confidence badge */}
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: '#7928ca',
            backgroundColor: 'rgba(121, 40, 202, 0.1)',
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
          }}>
            {suggestion.confidence}%
          </span>

          {/* Yes button */}
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
            <Check style={{ width: '12px', height: '12px' }} /> Yes
          </button>

          {/* No button */}
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
            <X style={{ width: '12px', height: '12px' }} /> No
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}