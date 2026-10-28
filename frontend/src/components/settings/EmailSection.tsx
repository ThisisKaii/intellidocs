import { useEffect, useState, type FormEvent } from 'react'
import { Check, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkNewEmail } from '@/lib/profileValidation'

/** What Supabase knows about the signed-in account's email. */
interface EmailState {
  /** An address a confirmation link was sent to, waiting to be confirmed. */
  pending: string | null
  /** True when the account has a password login, so its email can be changed here. */
  canChange: boolean
}

/**
 * Change the sign-in email. Supabase emails a confirmation link; the address only changes after
 * the link is opened, and until then the old one keeps working. Google-only accounts take their
 * email from Google, so they are told that instead of offered a form.
 */
export function EmailSection({ email, onEmailChanged }: { email: string; onEmailChanged: (email: string) => void }): JSX.Element {
  const [state, setState] = useState<EmailState>({ pending: null, canChange: true })
  const [nextEmail, setNextEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user
      if (!user) return
      // The confirmation link was opened: the stored account email follows the new address.
      if (user.email && user.email.toLowerCase() !== email.toLowerCase()) onEmailChanged(user.email)
      const identities = user.identities ?? []
      setState({
        pending: user.new_email ?? null,
        canChange: identities.length === 0 || identities.some((identity) => identity.provider === 'email'),
      })
    }).catch(() => undefined)
    // Read once when the page opens; later email edits arrive through the confirmation link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Ask Supabase to send the confirmation link to the new address. */
  async function sendConfirmation(address: string): Promise<void> {
    setBusy(true)
    setFeedback(null)
    try {
      const { data, error } = await supabase.auth.updateUser(
        { email: address },
        { emailRedirectTo: `${window.location.origin}/settings` },
      )
      if (error) {
        setFeedback({ ok: false, text: friendlyEmailError(error.message) })
        return
      }
      setState((prev) => ({ ...prev, pending: data.user?.new_email ?? address }))
      setNextEmail('')
      setFeedback({ ok: true, text: `We sent a confirmation link to ${address}. Open it to finish the change.` })
    } catch {
      setFeedback({ ok: false, text: 'Could not reach the sign-in service. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  /** Validate the typed address, then send the link. */
  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const problem = checkNewEmail(nextEmail, email)
    if (problem) {
      setFeedback({ ok: false, text: problem })
      return
    }
    void sendConfirmation(nextEmail.trim())
  }

  return (
    <section id="email" className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Mail className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Email address
      </h2>

      <p className="text-sm text-foreground mb-4 break-all">
        <span className="text-muted-foreground">Current: </span>{email || '—'}
      </p>

      {!state.canChange ? (
        <p className="text-sm text-muted-foreground">
          You sign in with Google, so your email address is managed by your Google account.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {state.pending && (
            <div role="status" className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <p className="m-0">Waiting for you to confirm <strong className="break-all">{state.pending}</strong>. Until you open the link we emailed, you keep signing in with {email}.</p>
              <button type="button" disabled={busy} onClick={() => { void sendConfirmation(state.pending ?? '') }} className="btn-ghost mt-2">
                {busy ? 'Sending…' : 'Resend the link'}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="new-email" className="text-sm text-muted-foreground">New email address</label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              value={nextEmail}
              onChange={(e) => { setNextEmail(e.target.value); setFeedback(null) }}
              placeholder="you@school.edu"
              className="settings-input max-w-sm w-full"
            />
          </div>
          {feedback && (
            <p role={feedback.ok ? 'status' : 'alert'} className={`text-sm flex items-center gap-1.5 ${feedback.ok ? 'text-green-600' : 'text-destructive'}`}>
              {feedback.ok && <Check className="size-4" strokeWidth={2} />}
              {feedback.text}
            </p>
          )}
          <button type="submit" disabled={busy || nextEmail.trim().length === 0} className="btn-primary">
            {busy ? 'Sending…' : 'Send confirmation link'}
          </button>
        </form>
      )}
    </section>
  )
}

/** Turn Supabase's technical email errors into something a person can act on. */
function friendlyEmailError(message: string): string {
  if (/rate limit|too many|seconds/i.test(message)) return 'Too many emails were sent recently. Wait a few minutes and try again.'
  if (/already (registered|been registered|exists)|already in use/i.test(message)) return 'That email address is already used by another account.'
  if (/invalid/i.test(message)) return 'That email address was not accepted. Check it and try again.'
  return message
}
