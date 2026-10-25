import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { isActive, phaseLabel, type TrackedImport } from '@/lib/importQueue'

interface ImportToastProps {
  items: TrackedImport[]
  /** Remove one finished row. */
  onDismiss: (id: string) => void
  /** Remove every finished row. */
  onDismissAll: () => void
  /** Open the document a finished import created. */
  onOpen: (documentId: string) => void
}

const iconButton = {
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
} as const

/** Header text summarising the whole batch. */
function summary(items: TrackedImport[]): string {
  const active = items.filter(isActive).length
  const failed = items.filter((item) => item.state === 'failed').length
  const done = items.length - active - failed
  if (active > 0) return `Importing ${active} file${active > 1 ? 's' : ''}…`
  if (failed > 0) return done > 0 ? `Imported ${done}, ${failed} failed` : `${failed} import${failed > 1 ? 's' : ''} failed`
  return `Imported ${done} file${done > 1 ? 's' : ''}`
}

/**
 * Bottom-right import progress panel. Lives above the routes, so it keeps
 * showing every import while the user moves around the app. Finished rows stay
 * until dismissed; failures keep their reason visible.
 */
export function ImportToast({ items, onDismiss, onDismissAll, onOpen }: ImportToastProps): JSX.Element {
  const anyFinished = items.some((item) => !isActive(item))

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-up"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 10050,
        width: '300px',
        maxHeight: '60vh',
        overflowY: 'auto',
        borderRadius: '0.625rem',
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        padding: '0.75rem 0.875rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, flex: 1 }}>{summary(items)}</span>
        {anyFinished && (
          <button type="button" onClick={onDismissAll} aria-label="Dismiss finished imports" style={iconButton}>
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        )}
      </div>

      {items.map((item) => {
        const active = isActive(item)
        const failed = item.state === 'failed'
        return (
          <div key={item.id} data-testid="import-row" style={{ padding: '0.375rem 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {active ? (
                <Loader2 style={{ width: '14px', height: '14px', color: 'var(--primary)', flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
              ) : failed ? (
                <AlertTriangle style={{ width: '14px', height: '14px', color: 'var(--error)', flexShrink: 0 }} />
              ) : (
                <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--success)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.fileName}
              </span>
              {!active && (
                <button type="button" onClick={() => onDismiss(item.id)} aria-label={`Dismiss ${item.fileName}`} style={iconButton}>
                  <X style={{ width: '12px', height: '12px' }} />
                </button>
              )}
            </div>

            {active && (
              <>
                <div style={{ height: '4px', borderRadius: '999px', backgroundColor: 'var(--secondary)', overflow: 'hidden', margin: '0.375rem 0 0.25rem' }}>
                  <div style={{ width: `${Math.min(100, Math.round(item.progress))}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 200ms ease' }} />
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: 0 }}>{phaseLabel(item.state)}</p>
              </>
            )}
            {failed && (
              <p style={{ fontSize: '0.6875rem', color: 'var(--error)', margin: '0.25rem 0 0', lineHeight: 1.4 }}>{item.error}</p>
            )}
            {item.state === 'done' && item.documentId && (
              <button
                type="button"
                onClick={() => onOpen(item.documentId)}
                style={{ fontSize: '0.6875rem', color: 'var(--primary)', background: 'none', border: 'none', padding: 0, marginTop: '0.25rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Open document
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
