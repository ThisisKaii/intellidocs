import { useEffect, useRef, useState } from 'react'
import { Loader2, UserCheck } from 'lucide-react'
import { api } from '@/services/api'
import { checkPersonName, initialPersonName } from '@/lib/profileValidation'

interface CompleteProfileModalProps {
  /** What is known so far (Google's given/family name or an older display name) to prefill. */
  initial: { firstName?: string | null; lastName?: string | null; displayName?: string | null }
  /** Called with the saved names. */
  onSaved: (names: { firstName: string; lastName: string; displayName: string | null }) => void
  /** Hide for now; it asks again on the next sign-in. */
  onLater: () => void
}

/**
 * First-run prompt for accounts without a first and last name (Google sign-ins
 * and accounts made before names were asked for). Names go to Auth metadata.
 */
export default function CompleteProfileModal({ initial, onSaved, onLater }: CompleteProfileModalProps): JSX.Element {
  const [names, setNames] = useState(() => initialPersonName(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef<HTMLInputElement>(null)
  const check = checkPersonName(names, { firstName: '', lastName: '' })

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    if (check.error) {
      setError(check.error)
      return
    }
    setBusy(true)
    setError('')
    try {
      const firstName = names.firstName.trim()
      const lastName = names.lastName.trim()
      const res = await api.auth.updateProfile({ firstName, lastName })
      onSaved({
        firstName: res.user.firstName ?? firstName,
        lastName: res.user.lastName ?? lastName,
        displayName: res.user.displayName ?? `${firstName} ${lastName}`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-profile-title"
      className="animate-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="animate-modal"
        style={{ width: '100%', maxWidth: '28rem', backgroundColor: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '1rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', padding: '1.5rem', fontFamily: 'inherit' }}
      >
        <h2 id="complete-profile-title" className="font-display" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
          Welcome to IntelliDocs — Complete Your Profile
        </h2>
        <p style={{ margin: '0.375rem 0 1.25rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Add your first and last name so your professors and classmates know whose work they are reading.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.75rem' }}>
          <div>
            <label htmlFor="onboard-first-name" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              First name
            </label>
            <input
              id="onboard-first-name"
              ref={firstRef}
              value={names.firstName}
              onChange={(e) => { setNames((prev) => ({ ...prev, firstName: e.target.value })); setError('') }}
              maxLength={50}
              autoComplete="given-name"
              className="settings-input w-full h-10"
              style={{ boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="onboard-last-name" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              Last name
            </label>
            <input
              id="onboard-last-name"
              value={names.lastName}
              onChange={(e) => { setNames((prev) => ({ ...prev, lastName: e.target.value })); setError('') }}
              maxLength={50}
              autoComplete="family-name"
              className="settings-input w-full h-10"
              style={{ boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {error && <p role="alert" style={{ margin: '0.625rem 0 0', fontSize: '0.8125rem', color: 'var(--destructive)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" onClick={onLater} disabled={busy} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
            Not now
          </button>
          <button type="submit" disabled={busy || check.error !== null} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Save and continue
          </button>
        </div>
      </form>
    </div>
  )
}
