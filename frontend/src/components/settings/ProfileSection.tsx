import { useState, type FormEvent } from 'react'
import { Check, UserCog } from 'lucide-react'
import { api } from '@/services/api'

/** Editable display-name form; persists via PATCH /auth/profile. */
export function ProfileSection({
  userDisplayName,
  onSaved,
}: {
  userDisplayName: string
  onSaved: (patch: { displayName?: string | null }) => void
}): JSX.Element {
  const [displayName, setDisplayName] = useState(userDisplayName)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) {
      setFeedback({ ok: false, text: 'Display name cannot be empty' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await api.auth.updateProfile(trimmed)
      onSaved({ displayName: res.user.displayName })
      setDisplayName(res.user.displayName ?? '')
      setFeedback({ ok: true, text: res.message })
    } catch {
      setFeedback({ ok: false, text: 'Failed to update profile. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="profile" className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Profile
      </h2>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="display-name" className="text-sm text-muted-foreground">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            className="settings-input max-w-sm w-full"
          />
        </div>

        {feedback && (
          <p
            className={`text-sm flex items-center gap-1.5 ${
              feedback.ok ? 'text-green-600' : 'text-destructive'
            }`}
          >
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  )
}
