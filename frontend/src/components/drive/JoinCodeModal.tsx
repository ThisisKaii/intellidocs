import { useEffect, useRef, useState } from 'react'
import { Loader2, Users, X } from 'lucide-react'
import { api, type JoinCodeResult } from '@/services/api'

interface JoinCodeModalProps {
  /** Called when the dialog closes. */
  onClose: () => void
  /** Called after a code was accepted, so the shared list can refresh. */
  onJoined: (result: JoinCodeResult) => void
  /** Called when the person chooses to open the document they just added. */
  onOpenDocument: (documentId: string) => void
}

/** Shape what the person types as K7M2-QX9P: upper case, letters and digits only, a dash after four. */
export function formatCodeInput(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

/**
 * Join a shared document with the short code its owner gave you. The document is added to
 * "Shared with me" with the permission the owner chose.
 */
export default function JoinCodeModal({ onClose, onJoined, onOpenDocument }: JoinCodeModalProps): JSX.Element {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<JoinCodeResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, busy])

  /** Send the code to the server and show the document it added. */
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    if (code.replace('-', '').length !== 8) {
      setError('Enter the 8-character code, for example K7M2-QX9P')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.documents.joinWithCode(code)
      setJoined(result)
      onJoined(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enter a share code"
      className="animate-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="animate-modal"
        style={{ width: '100%', maxWidth: '26rem', backgroundColor: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '1rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', padding: '1.5rem', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 className="font-display" style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>Enter a share code</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
              Type the code the owner shared to collaborate on their document.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}>
            <X className="size-4" />
          </button>
        </div>

        {joined ? (
          <div>
            <p style={{ fontSize: '0.875rem', margin: '0 0 1rem' }}>
              {joined.alreadyShared ? 'You already have access to ' : 'Added '}
              <strong>{joined.title}</strong>
              {joined.alreadyShared ? '.' : ' to Shared with me.'} You can {joined.permission === 'edit' ? 'edit' : joined.permission === 'comment' ? 'comment on' : 'view'} it.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
                Done
              </button>
              <button type="button" onClick={() => { onOpenDocument(joined.documentId); onClose() }} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                Open document
              </button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="share-code-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              Share code
            </label>
            <input
              id="share-code-input"
              ref={inputRef}
              value={code}
              onChange={(e) => { setCode(formatCodeInput(e.target.value)); setError('') }}
              placeholder="K7M2-QX9P"
              autoComplete="off"
              spellCheck={false}
              style={{ width: '100%', height: '2.75rem', borderRadius: '0.625rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', padding: '0 0.875rem', fontSize: '1.125rem', fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
            />
            {error && <p role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--destructive, #dc2626)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
                {busy ? 'Checking…' : 'Join'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
