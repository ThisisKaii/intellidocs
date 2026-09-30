import { useState } from 'react'
import { GitFork, Loader2, X } from 'lucide-react'

interface PresetForkPromptProps {
  /** Name of the standard blueprint the document started from. */
  baseName: string
  /** What the user changed, e.g. "Margins and page size". */
  driftedOn: string
  /** Create the fork. Resolves once the new version exists. */
  onFork: () => Promise<void>
  /** Dismiss the prompt and stay on the standard preset. */
  onDismiss: () => void
  /** True while the fork request is in flight. */
  busy?: boolean
  /** Server-side error to surface inside the prompt. */
  error?: string
}

/**
 * Non-intrusive prompt shown when a document's page setup no longer matches
 * the standard blueprint it was created from. Accepting saves the customisation
 * as a new personal version — "APA 7th Edition (Custom v2)" — so the student
 * keeps a reusable starting point without the standard ever changing for
 * anyone else.
 */
export default function PresetForkPrompt({
  baseName,
  driftedOn,
  onFork,
  onDismiss,
  busy = false,
  error,
}: PresetForkPromptProps): JSX.Element {
  const [localError, setLocalError] = useState('')

  /** Fork the preset, surfacing any failure inside the prompt. */
  async function handleFork(): Promise<void> {
    setLocalError('')
    try {
      await onFork()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not save your version')
    }
  }

  const message = localError || error

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
      <GitFork className="size-4 shrink-0" style={{ color: 'var(--accent-strong)', marginTop: '0.15rem' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--foreground)',
          }}
        >
          {driftedOn} no longer matches {baseName}
        </p>
        <p
          style={{
            margin: '0.2rem 0 0',
            fontSize: '0.75rem',
            lineHeight: 1.45,
            color: 'var(--muted-foreground)',
          }}
        >
          Save it as your own version and keep using it for future documents.
        </p>

        {message && (
          <p role="alert" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--destructive)' }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.625rem' }}>
          <button
            type="button"
            onClick={() => void handleFork()}
            disabled={busy}
            style={{
              height: '1.875rem',
              padding: '0 0.75rem',
              borderRadius: '0.4375rem',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            {busy ? 'Saving…' : 'Save as my version'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            style={{
              height: '1.875rem',
              padding: '0 0.75rem',
              borderRadius: '0.4375rem',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Keep standard
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        disabled={busy}
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
          cursor: busy ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
