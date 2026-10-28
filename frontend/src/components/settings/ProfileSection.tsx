import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, Check, Trash2, UserCog } from 'lucide-react'
import { api } from '@/services/api'
import { UserAvatar } from '@/components/UserAvatar'
import { checkDisplayName, validateAvatarFile } from '@/lib/profileValidation'

interface ProfileSectionProps {
  userDisplayName: string
  /** Used for the initials shown when there is no photo. */
  email: string
  avatarUrl: string | null
  onSaved: (patch: { displayName?: string | null; avatarUrl?: string | null }) => void
}

/** Profile photo and display name; the photo uploads at once, the name saves with the button. */
export function ProfileSection({ userDisplayName, email, avatarUrl, onSaved }: ProfileSectionProps): JSX.Element {
  const [displayName, setDisplayName] = useState(userDisplayName)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoFeedback, setPhotoFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const check = checkDisplayName(displayName, userDisplayName)

  // Leaving with an unsaved name asks first; nothing is asked when the name is untouched.
  useEffect(() => {
    if (!check.changed) return
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [check.changed])

  /** Save the display name through the server. */
  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (check.error) {
      setFeedback({ ok: false, text: check.error })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await api.auth.updateProfile(displayName.trim())
      onSaved({ displayName: res.user.displayName })
      setDisplayName(res.user.displayName ?? '')
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
        <div className="flex flex-col gap-2">
          <label htmlFor="display-name" className="text-sm text-muted-foreground">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setFeedback(null) }}
            maxLength={100}
            placeholder="Your name"
            aria-invalid={check.error ? true : undefined}
            className="settings-input max-w-sm w-full"
          />
          <p className="text-xs text-muted-foreground">Shown to people you share documents with.</p>
        </div>

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
