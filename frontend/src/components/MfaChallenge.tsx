import { useState, type FormEvent } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { verifyMfaCode } from '../lib/mfa'

interface MfaChallengeProps {
  /** Called with the upgraded session once the code is accepted. */
  onVerified: (session: Session) => void
  /** Called when the user backs out; the caller signs them out. */
  onCancel: () => void
}

/** Asks for the 6-digit authenticator code after the password (or Google) step. */
export function MfaChallenge({ onVerified, onCancel }: MfaChallengeProps): JSX.Element {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Verify the code and hand the new session to the caller. */
  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      onVerified(await verifyMfaCode(code))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => { void handleSubmit(e) }}
      className="w-full max-w-[360px] rounded-md border border-border bg-card p-7 shadow-sm"
      aria-label="Two-factor verification"
    >
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" strokeWidth={1.75} />
        <h1 className="m-0 text-lg font-bold">Two-factor verification</h1>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Open your authenticator app and enter the 6-digit code for IntelliDocs.
      </p>
      <label htmlFor="mfa-code" className="mb-1.5 block text-sm font-medium">Authentication code</label>
      <input
        id="mfa-code"
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
        placeholder="123456"
        className="settings-input h-10 w-full text-center font-mono tracking-[0.4em]"
      />
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className="btn-primary mt-4 flex h-10 w-full items-center justify-center gap-2 disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" />} Verify and sign in
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground">
        Use a different account
      </button>
    </form>
  )
}
