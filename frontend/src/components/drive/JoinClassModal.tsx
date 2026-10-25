import { useEffect, useRef, useState } from 'react'
import { GraduationCap, Loader2, X } from 'lucide-react'
import { api, type FolderRecord } from '@/services/api'

interface JoinClassModalProps {
  /** Called when the modal closes. */
  onClose: () => void
  /** Called after the student joined, so the folder list can refresh. */
  onJoined: (classFolder: FolderRecord) => void
  /** Called when the student chooses to open the class they just joined. */
  onOpenClass: (classFolder: FolderRecord) => void
}

/**
 * Join a class by typing the code the professor shared. Joining also creates a
 * workspace folder for the student inside the class, named after them, which
 * they can rename like any other folder.
 */
export default function JoinClassModal({ onClose, onJoined, onOpenClass }: JoinClassModalProps): JSX.Element {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<FolderRecord | null>(null)
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

  /** Send the code to the server and show the class that matched. */
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    if (code.trim().length < 4) {
      setError('Enter the code your professor gave you')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.folders.join(code.trim())
      setJoined(result.classFolder)
      onJoined(result.classFolder)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the class')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join a class"
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
            <h2 className="font-display" style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>Join a class</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
              Enter the code your professor shared with you.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}>
            <X className="size-4" />
          </button>
        </div>

        {joined ? (
          <div>
            <p style={{ fontSize: '0.875rem', margin: '0 0 1rem' }}>
              You joined <strong>{joined.name}</strong>. A workspace folder with your name is waiting inside it, and you can rename it any time.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
                Done
              </button>
              <button type="button" onClick={() => { onOpenClass(joined); onClose() }} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                Open class
              </button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="join-code" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              Class code
            </label>
            <input
              id="join-code"
              ref={inputRef}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
              placeholder="e.g. K7M2QX"
              maxLength={12}
              autoComplete="off"
              className="settings-input w-full h-10"
              style={{ boxSizing: 'border-box', letterSpacing: '0.15em', fontWeight: 600 }}
            />
            {error && <p role="alert" style={{ margin: '0.625rem 0 0', fontSize: '0.8125rem', color: 'var(--destructive)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <GraduationCap className="size-4" />}
                Join class
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
