import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface IeeeRestructureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the dialog has closed, so the editor has its focus back. */
  onConfirm: () => void
}

/** Confirms the IEEE restructure instead of the browser's confirm() box. */
export function IeeeRestructureDialog({ open, onOpenChange, onConfirm }: IeeeRestructureDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose data-testid="ieee-restructure-dialog" className="max-w-md">
        <DialogTitle>Restructure into IEEE format?</DialogTitle>
        <DialogDescription className="mt-2">
          Sections matching IEEE headings keep their content. Missing sections are added blank. Unmatched
          content is moved to &lsquo;Unmapped Content&rsquo;.
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false)
              // Let the focus trap release before the command focuses the editor.
              requestAnimationFrame(onConfirm)
            }}
          >
            Restructure
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface IeeeConvertCopyDialogProps {
  open: boolean
  defaultTitle: string
  busy: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onConfirm: (copyTitle: string) => void
}

/** Confirms creating a new IEEE Conference copy without modifying the current document. */
export function IeeeConvertCopyDialog({
  open,
  defaultTitle,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: IeeeConvertCopyDialogProps): JSX.Element {
  const [title, setTitle] = useState(defaultTitle)

  useEffect(() => {
    if (open) setTitle(defaultTitle)
  }, [open, defaultTitle])

  const trimmed = title.trim()

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent hideClose data-testid="ieee-convert-copy-dialog" className="max-w-md">
        <DialogTitle>Convert to IEEE copy?</DialogTitle>
        <DialogDescription className="mt-2">
          Creates a new IEEE Conference document from your content (two-column layout, IEEE Roman/letter
          section numbering, and Letter margins). Matching sections stay intact and unmatched content is kept
          under &lsquo;Unmapped Content&rsquo;. Your current document will remain untouched.
        </DialogDescription>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (trimmed && !busy) onConfirm(trimmed)
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            New document title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={200}
              placeholder="Document Title (IEEE)"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>

          {error && (
            <p className="text-xs font-medium text-destructive">{error}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Creating IEEE copy…
                </>
              ) : (
                'Create IEEE copy'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
