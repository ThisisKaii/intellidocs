import { FileText, X } from 'lucide-react'

interface DocumentTypePromptProps {
  /** What the document looks like, e.g. "IEEE paper". */
  typeLabel: string
  /** Name of the standard format that would guide suggestions. */
  presetName: string
  /** Use that format for suggestions. */
  onApply: () => void
  /** Hide the prompt for this document. */
  onDismiss: () => void
}

/**
 * Shown once for an opened file that has no format chosen yet but reads like a known kind of paper.
 * Accepting only sets the format guiding suggestions; the page layout stays as imported.
 */
export default function DocumentTypePrompt({ typeLabel, presetName, onApply, onDismiss }: DocumentTypePromptProps): JSX.Element {
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
      <FileText className="size-4 shrink-0" style={{ color: 'var(--accent-strong)', marginTop: '0.15rem' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
          This looks like {typeLabel.toLowerCase().startsWith('ieee') ? 'an' : 'a'} {typeLabel}
        </p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
          Use the {presetName} format to get suggestions for its headings and sections. Your page layout stays as it is.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button
            type="button"
            onClick={onApply}
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
            Use {presetName}
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
