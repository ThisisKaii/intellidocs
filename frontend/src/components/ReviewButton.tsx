import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquarePlus, X, ImagePlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/services/api'

const DRAFT_KEY = 'intellidocs.reviewDraft'
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Floating review button (signed-in users) that opens a popup for text plus screenshots. */
export default function ReviewButton(): JSX.Element | null {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState<boolean>(false)
  const [message, setMessage] = useState<string>(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [images, setImages] = useState<File[]>([])
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [sent, setSent] = useState<boolean>(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const previews = useMemo<string[]>(() => images.map((file) => URL.createObjectURL(file)), [images])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  // Keep the typed text across page reloads (images cannot be stored, so only they are lost).
  useEffect(() => {
    try {
      if (message) localStorage.setItem(DRAFT_KEY, message)
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* storage unavailable: the in-memory draft still works */
    }
  }, [message])

  if (!user) return null

  /** Close the popup but keep the draft, so the tester can reopen it unchanged. */
  const close = (): void => {
    setOpen(false)
    setError('')
    if (sent) {
      finish()
    }
  }

  /** Close the popup and clear the draft (used after a successful send). */
  const finish = (): void => {
    setOpen(false)
    setMessage('')
    setImages([])
    setError('')
    setSent(false)
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }

  /** Reset form fields so the user can immediately type another review without closing the modal. */
  const resetForNewReview = (): void => {
    setMessage('')
    setImages([])
    setError('')
    setSent(false)
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }

  /** Add picked or pasted images, enforcing type, size and the 5-image cap. */
  const addImages = (files: File[]): void => {
    const valid = files.filter((file) => ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES)
    if (valid.length < files.length) setError('Only PNG, JPG, GIF or WebP images up to 10 MB are accepted.')
    else setError('')
    setImages((current) => [...current, ...valid].slice(0, MAX_IMAGES))
  }

  /** Send the review to the server. */
  const submit = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.reviews.submit(message.trim(), location.pathname, images)
      setSent(true)
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (sent) finish()
          setOpen(true)
        }}
        aria-label="Send a review"
        className="fixed bottom-4 right-4 z-[1000] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-slate-700"
      >
        <MessageSquarePlus size={16} />
        Review
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Send a review"
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onPaste={(event) => addImages(Array.from(event.clipboardData.files))}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Send a review</h2>
              <button type="button" onClick={close} aria-label="Close" className="text-slate-500 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="py-6 text-center">
                <p className="text-sm font-semibold text-slate-900">Thanks! Your review was sent.</p>
                <p className="mt-1 text-xs text-slate-500">You can submit multiple reviews anytime.</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={resetForNewReview}
                    className="rounded bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 cursor-pointer"
                  >
                    Send another review
                  </button>
                  <button
                    type="button"
                    onClick={finish}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={5000}
                  rows={6}
                  placeholder="What went wrong, or what could be better? You can paste screenshots here."
                  className="w-full resize-none rounded border border-slate-300 p-2 text-sm text-slate-900"
                />

                {previews.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {previews.map((url, index) => (
                      <div key={url} className="relative">
                        <img src={url} alt={`Attachment ${index + 1}`} className="h-16 w-16 rounded border object-cover" />
                        <button
                          type="button"
                          aria-label={`Remove attachment ${index + 1}`}
                          onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                          className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  multiple
                  hidden
                  onChange={(event) => {
                    addImages(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />

                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={images.length >= MAX_IMAGES}
                    onClick={() => fileInput.current?.click()}
                    className="flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 disabled:opacity-50"
                  >
                    <ImagePlus size={16} />
                    Add images ({images.length}/{MAX_IMAGES})
                  </button>
                  <button
                    type="button"
                    disabled={busy || !message.trim()}
                    onClick={submit}
                    className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {busy ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
