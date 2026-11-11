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
