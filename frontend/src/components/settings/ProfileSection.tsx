import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, Check, Trash2, UserCog } from 'lucide-react'
import { api } from '@/services/api'
import { UserAvatar } from '@/components/UserAvatar'
import { checkPersonName, initialPersonName, validateAvatarFile } from '@/lib/profileValidation'

interface ProfileSectionProps {
  userDisplayName: string
  /** Saved first and last name (Auth metadata); prefilled from the display name when missing. */
  userFirstName?: string | null
  userLastName?: string | null
  /** Used for the initials shown when there is no photo. */
  email: string
  avatarUrl: string | null
  onSaved: (patch: { displayName?: string | null; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null }) => void
}

/** Profile photo and first/last name; the photo uploads at once, the name saves with the button. */
export function ProfileSection({ userDisplayName, userFirstName, userLastName, email, avatarUrl, onSaved }: ProfileSectionProps): JSX.Element {
  const [saved, setSaved] = useState(() => initialPersonName({ firstName: userFirstName, lastName: userLastName, displayName: userDisplayName }))
  const [firstName, setFirstName] = useState(saved.firstName)
  const [lastName, setLastName] = useState(saved.lastName)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoFeedback, setPhotoFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const check = checkPersonName({ firstName, lastName }, saved)

  // Leaving with an unsaved name asks first; nothing is asked when the name is untouched.
  useEffect(() => {
    if (!check.changed) return
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [check.changed])

  /** Save the first and last name through the server (stored in Auth metadata). */
  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (check.error) {
      setFeedback({ ok: false, text: check.error })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await api.auth.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() })
      const next = { firstName: res.user.firstName ?? firstName.trim(), lastName: res.user.lastName ?? lastName.trim() }
      onSaved({ displayName: res.user.displayName ?? null, ...next })
      setSaved(next)
      setFirstName(next.firstName)
      setLastName(next.lastName)
      setFeedback({ ok: true, text: 'Name saved.' })
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Could not save your name. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  /** Upload the chosen picture as the new profile photo. */
  async function handlePhotoChosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = validateAvatarFile(file)
    if (problem) {
      setPhotoFeedback({ ok: false, text: problem })
      return
    }
    setPhotoBusy(true)
    setPhotoFeedback(null)
    try {
      const res = await api.auth.uploadAvatar(file)
      onSaved({ avatarUrl: res.avatarUrl })
      setPhotoFeedback({ ok: true, text: 'Photo updated.' })
    } catch (err) {
      setPhotoFeedback({ ok: false, text: err instanceof Error ? err.message : 'Could not upload the picture.' })
    } finally {
      setPhotoBusy(false)
    }
  }

  /** Remove the profile photo so initials show again. */
  async function handlePhotoRemove(): Promise<void> {
    setPhotoBusy(true)
    setPhotoFeedback(null)
    try {
      await api.auth.removeAvatar()
      onSaved({ avatarUrl: null })
      setPhotoFeedback({ ok: true, text: 'Photo removed.' })
    } catch (err) {
      setPhotoFeedback({ ok: false, text: err instanceof Error ? err.message : 'Could not remove the picture.' })
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <section id="profile" className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Profile
      </h2>

      <div className="flex items-center gap-4 mb-6">
        <UserAvatar src={avatarUrl} name={userDisplayName || email || 'User'} size={64} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { void handlePhotoChosen(e) }}
              className="hidden"
              aria-label="Profile photo file"
            />
            <button type="button" disabled={photoBusy} onClick={() => fileInputRef.current?.click()} className="btn-ghost">
              <Camera className="size-4" strokeWidth={1.75} />
              {photoBusy ? 'Working…' : avatarUrl ? 'Change photo' : 'Add photo'}
            </button>
            {avatarUrl && (
              <button type="button" disabled={photoBusy} onClick={() => { void handlePhotoRemove() }} className="btn-ghost">
                <Trash2 className="size-4" strokeWidth={1.75} />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 2 MB.</p>
          {photoFeedback && (
            <p role={photoFeedback.ok ? 'status' : 'alert'} className={`text-sm flex items-center gap-1.5 ${photoFeedback.ok ? 'text-green-600' : 'text-destructive'}`}>
              {photoFeedback.ok && <Check className="size-4" strokeWidth={2} />}
              {photoFeedback.text}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={(e) => { void handleSave(e) }} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <div className="flex flex-col gap-2">
            <label htmlFor="first-name" className="text-sm text-muted-foreground">
              First name
            </label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              autoComplete="given-name"
              onChange={(e) => { setFirstName(e.target.value); setFeedback(null) }}
              maxLength={50}
              aria-invalid={check.changed && check.error ? true : undefined}
              className="settings-input w-full"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="last-name" className="text-sm text-muted-foreground">
              Last name
            </label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              autoComplete="family-name"
              onChange={(e) => { setLastName(e.target.value); setFeedback(null) }}
              maxLength={50}
              aria-invalid={check.changed && check.error ? true : undefined}
              className="settings-input w-full"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Shown to your professors and to people you share documents with.</p>

        {feedback && (
          <p role={feedback.ok ? 'status' : 'alert'} className={`text-sm flex items-center gap-1.5 ${feedback.ok ? 'text-green-600' : 'text-destructive'}`}>
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}
        {!feedback && check.changed && check.error && <p className="text-sm text-destructive">{check.error}</p>}

        <button type="submit" disabled={saving || !check.changed || check.error !== null} className="btn-primary self-start">
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </section>
  )
}
