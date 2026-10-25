import { useState } from 'react'
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { api, type FolderRecord } from '@/services/api'

interface JoinCodeBadgeProps {
  folder: FolderRecord
  /** Called with the folder carrying its new code after a regenerate. */
  onChanged?: (folder: FolderRecord) => void
}

/** Shows a class's join code with copy and regenerate buttons (owner only). */
export default function JoinCodeBadge({ folder, onChanged }: JoinCodeBadgeProps): JSX.Element | null {
  const [code, setCode] = useState<string | null>(folder.join_code ?? null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!code) return null

  /** Copy the code so the professor can paste it into a message to students. */
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed. Select the code and copy it by hand.')
    }
  }

  /** Replace the code; students who already joined stay enrolled. */
  async function regenerate(): Promise<void> {
    if (!window.confirm('Make a new code? The old code stops working. Students already in the class stay enrolled.')) return
    setBusy(true)
    setError('')
    try {
      const updated = await api.folders.regenerateJoinCode(folder.folder_id)
      setCode(updated.join_code ?? null)
      onChanged?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make a new code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Join code</span>
        <code className="text-sm font-bold tracking-[0.2em]" data-testid="join-code">{code}</code>
        <button type="button" onClick={() => { void copy() }} aria-label="Copy join code" className="inline-flex text-muted-foreground hover:text-foreground">
          {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
        </button>
        <button type="button" onClick={() => { void regenerate() }} disabled={busy} aria-label="Make a new join code" className="inline-flex text-muted-foreground hover:text-foreground disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
