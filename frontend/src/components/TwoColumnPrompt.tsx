import { Columns, X } from 'lucide-react'

interface TwoColumnPromptProps {
  /** Open the two-column IEEE preview of the document. */
  onPreview: () => void
  /** Hide the prompt for this document. */
  onDismiss: () => void
}

/**
 * Shown once for an imported file that is laid out in two columns (a paper). The editor shows it as a
 * single column, so this offers the print preview that sets it in IEEE's two-column layout.
 */
export default function TwoColumnPrompt({ onPreview, onDismiss }: TwoColumnPromptProps): JSX.Element {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        padding: '0.75rem 0.875rem',
        borderRadius: '0.625rem',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent-strong)',
        backgroundColor: 'var(--card)',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
      }}
    >
      <Columns className="size-4 shrink-0" style={{ color: 'var(--accent-strong)', marginTop: '0.15rem' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
          This file is set in two columns
        </p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
          The editor shows it as one column. You can see it in IEEE's two-column layout and save it as a PDF.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button
            type="button"
            onClick={onPreview}
            style={{
              padding: '0.3rem 0.7rem',
              border: 'none',
              borderRadius: '0.5rem',
              background: 'var(--accent-strong)',
              color: '#fff',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Preview in IEEE layout
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{ padding: '0.3rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            Not now
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        title="Close"
        style={{ border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex' }}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
