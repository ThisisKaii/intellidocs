import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Download, LogOut, Loader2, Trash2 } from 'lucide-react'
import { api, type StorageSummary } from '@/services/api'
import { supabase } from '@/lib/supabase'
import { downloadTextFile } from '@/lib/csv'
import { useAuth } from '@/hooks/useAuth'
import { ConfirmDialog } from './ConfirmDialog'

/** Format a byte count as a short readable size. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

/** Storage use, sign-out everywhere, a download of the user's data, and account deletion. */
export function DataSection(): JSX.Element {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [storage, setStorage] = useState<StorageSummary | null>(null)
  const [busy, setBusy] = useState<'export' | 'signout' | 'delete' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')

  useEffect(() => {
    api.auth.storage().then(setStorage).catch(() => setStorage(null))
  }, [])

  const used = storage ? Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100)) : 0

  /** Download everything the account holds as one JSON file. */
  async function exportData(): Promise<void> {
    setBusy('export')
    setMessage(null)
    try {
      const data = await api.profile.exportData()
      downloadTextFile('intellidocs-account-data.json', JSON.stringify(data, null, 2), 'application/json')
      setMessage({ ok: true, text: 'Your data was downloaded.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not export your data' })
    } finally {
      setBusy(null)
    }
  }

  /** End every session of this account, including this one. */
  async function signOutEverywhere(): Promise<void> {
    setBusy('signout')
    try {
      await supabase.auth.signOut({ scope: 'global' })
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  /** Permanently delete the account, then leave the app. */
  async function deleteAccount(): Promise<void> {
    setBusy('delete')
    setMessage(null)
    try {
      await api.auth.deleteAccount(typedEmail.trim())
      await supabase.auth.signOut().catch(() => undefined)
      logout()
      navigate('/login', { replace: true })
    } catch (err) {
      setDeleting(false)
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not delete the account' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="data" className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Database className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Data &amp; account
      </h2>

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Storage used</span>
          <span className="font-medium tabular-nums">{storage ? `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)}` : '—'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
          <div className={`h-full rounded-full ${used >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${used}%` }} />
        </div>
        {used >= 80 && <p className="mt-2 text-xs text-destructive">Almost full. Delete documents or empty the Trash to free space.</p>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="m-0 text-sm font-medium">Download my data</p>
            <p className="m-0 text-xs text-muted-foreground">Your documents, folders and preferences as one JSON file.</p>
          </div>
          <button type="button" onClick={() => { void exportData() }} disabled={busy !== null} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50">
            {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="m-0 text-sm font-medium">Sign out of all devices</p>
            <p className="m-0 text-xs text-muted-foreground">Ends every session, including this one.</p>
          </div>
          <button type="button" onClick={() => { void signOutEverywhere() }} disabled={busy !== null} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50">
            {busy === 'signout' ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Sign out everywhere
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div>
            <p className="m-0 text-sm font-medium text-destructive">Delete my account</p>
            <p className="m-0 text-xs text-muted-foreground">Permanently removes your documents, folders and sign-in. This cannot be undone.</p>
          </div>
          <button type="button" onClick={() => { setTypedEmail(''); setDeleting(true) }} disabled={busy !== null} className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="size-4" /> Delete account
          </button>
        </div>
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}>{message.text}</p>}

      <ConfirmDialog
        open={deleting}
        title="Delete your account?"
        confirmLabel="Delete forever"
        destructive
        busy={busy === 'delete'}
        canConfirm={typedEmail.trim().toLowerCase() === (user?.email ?? '').toLowerCase() && typedEmail.trim() !== ''}
        onCancel={() => setDeleting(false)}
        onConfirm={() => { void deleteAccount() }}
      >
        <p className="m-0 mb-3">All your documents and folders are deleted. Type <strong className="text-foreground">{user?.email}</strong> to confirm.</p>
        <input aria-label="Type your email to confirm" value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} className="settings-input h-10 w-full" autoComplete="off" />
      </ConfirmDialog>
    </section>
  )
}
