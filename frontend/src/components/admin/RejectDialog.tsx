import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'

interface RejectDialogProps {
  /** Who is being rejected, shown in the heading. */
  applicantName: string
  busy: boolean
  onCancel: () => void
  /** Called with the reason the applicant will read. */
  onConfirm: (reason: string) => void
}

/** Asks the admin for the reason shown to a rejected applicant (replaces a browser prompt). */
export function RejectDialog({ applicantName, busy, onCancel, onConfirm }: RejectDialogProps): JSX.Element {
  const [reason, setReason] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div role="dialog" aria-modal="true" aria-label="Reject application" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!busy) onConfirm(reason.trim()) }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-bold">Reject {applicantName}?</h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">They will see this reason and can apply again.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <label htmlFor="reject-reason" className="mb-1 block text-sm font-semibold">Reason (optional)</label>
        <textarea id="reject-reason" ref={ref} rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className="settings-input w-full resize-none" placeholder="e.g. Please use your institutional email address." />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Reject application
          </button>
        </div>
      </form>
    </div>
  )
}
