import { ScanSearch, X } from 'lucide-react'

interface DocumentTypePromptProps {
  /** Inferred archetype name, e.g. 'Academic Thesis'. */
  typeLabel: string
  /** Name of the standard preset that matches the archetype. */
  presetName: string
  /** Apply the matching standard format to the document. */
  onApply: () => void
  /** Dismiss the prompt and leave the document as-is. */
  onDismiss: () => void
}

/**
 * Non-intrusive prompt shown when the structure inference recognizes an
 * unformatted document's archetype (thesis, IEEE manuscript, APA manuscript)
 * and no preset is set yet. Accepting binds the matching standard preset, and
 * the format scanner then walks the document suggesting per-element formats.
 */
export default function DocumentTypePrompt({
  typeLabel,
  presetName,
  onApply,
  onDismiss,
}: DocumentTypePromptProps): JSX.Element {
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
        borderLeft: '3px solid var(--primary)',
        backgroundColor: 'var(--card)',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
      }}
    >
      <ScanSearch className="size-4 shrink-0" style={{ color: 'var(--primary)', marginTop: '0.15rem' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--foreground)',
          }}
        >
          This document looks like an {typeLabel}
        </p>
        <p
          style={{
            margin: '0.2rem 0 0',
            fontSize: '0.75rem',
            lineHeight: 1.45,
            color: 'var(--muted-foreground)',
          }}
        >
          Apply the {presetName} standard format and get suggestions for each element.
        </p>

        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.625rem' }}>
          <button
            type="button"
            onClick={onApply}
            style={{
              height: '1.875rem',
              padding: '0 0.75rem',
              borderRadius: '0.4375rem',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Apply standard format
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              height: '1.875rem',
              padding: '0 0.75rem',
              borderRadius: '0.4375rem',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Not now
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          width: '1.5rem',
          height: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0.375rem',
          border: 'none',
          background: 'transparent',
          color: 'var(--muted-foreground)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
