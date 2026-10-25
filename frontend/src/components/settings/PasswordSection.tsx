import { useEffect, useState, type FormEvent } from 'react'
import { Check, Lock } from 'lucide-react'
import { api } from '@/services/api'
import { supabase } from '@/lib/supabase'

/** Change the password through the server; accounts that sign in with a password must give the current one. */
export function PasswordSection(): JSX.Element {
  const [hasPassword, setHasPassword] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  // A Google-only account has no password yet, so there is no current one to ask for.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const identities = data?.user?.identities ?? []
      setHasPassword(identities.some((identity) => identity.provider === 'email'))
    }).catch(() => setHasPassword(true))
  }, [])

  /** Validate the form, then ask the server to change the password. */
  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFeedback(null)

    if (hasPassword && !currentPassword) {
      setFeedback({ ok: false, text: 'Enter your current password.' })
      return
    }
    if (newPassword.length < 8) {
      setFeedback({ ok: false, text: 'Password must be at least 8 characters long.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ ok: false, text: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    try {
      await api.auth.changePassword(newPassword, hasPassword ? currentPassword : undefined)
      setFeedback({ ok: true, text: hasPassword ? 'Password updated.' : 'Password set. You can now sign in with your email too.' })
      setHasPassword(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Could not update the password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="password" className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Lock className="size-4 text-muted-foreground" strokeWidth={1.75} />
        {hasPassword ? 'Change password' : 'Set a password'}
      </h2>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
        {hasPassword && (
          <div className="flex flex-col gap-2">
            <label htmlFor="current-password" className="text-sm text-muted-foreground">Current password</label>
            <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="settings-input max-w-sm w-full" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="new-password" className="text-sm text-muted-foreground">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" className="settings-input max-w-sm w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-password" className="text-sm text-muted-foreground">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="settings-input max-w-sm w-full" />
        </div>

        {feedback && (
          <p role={feedback.ok ? 'status' : 'alert'} className={`text-sm flex items-center gap-1.5 ${feedback.ok ? 'text-green-600' : 'text-destructive'}`}>
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Updating…' : hasPassword ? 'Update password' : 'Set password'}
        </button>
      </form>
    </section>
  )
}
