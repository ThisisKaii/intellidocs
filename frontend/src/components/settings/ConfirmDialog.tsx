import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What will happen; shown under the title. */
  children: ReactNode
  confirmLabel: string
  /** Style the confirm button as a destructive action. */
  destructive?: boolean
  busy?: boolean
  /** Disables the confirm button until true (for type-to-confirm). */
  canConfirm?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** A small confirmation dialog that replaces the browser's confirm() box. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  canConfirm = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="m-0 text-base font-bold">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !canConfirm}
            className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50 ${destructive ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
