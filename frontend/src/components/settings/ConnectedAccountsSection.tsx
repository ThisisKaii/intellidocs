import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, HardDrive, Link2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDriveConnection } from '@/hooks/useDriveConnection'
import { getLinkedGoogleIdentity, type LinkedGoogleIdentity } from '@/lib/googleIdentity'
import { clearGoogleLinking, GOOGLE_LINK_SCOPES, linkErrorMessage, markGoogleLinking } from '@/lib/googleLink'
import { ConfirmDialog } from './ConfirmDialog'

const ROW = 'flex items-center justify-between gap-3 py-3'
const SECONDARY_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50'
const DANGER_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50'

/**
 * Google sign-in link and Google Drive, shown separately: the first is a Supabase identity on the
 * account, the second is the Drive access the server stores. Either can be removed on its own.
 */
export function ConnectedAccountsSection(): JSX.Element {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const drive = useDriveConnection()
  const [google, setGoogle] = useState<LinkedGoogleIdentity | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [confirmDriveOff, setConfirmDriveOff] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const loadIdentity = useCallback(async () => {
    try {
      setGoogle(await getLinkedGoogleIdentity())
    } catch (err) {
      console.error('Failed to check OAuth identities', err)
      setGoogle(null)
    }
  }, [])

  useEffect(() => {
    void loadIdentity()
  }, [loadIdentity])

  // Outcome of a link round trip, handed back by AuthCallback on the URL; shown once.
  useEffect(() => {
    const code = params.get('link_error')
    const done = params.get('linked')
    if (!code && !done) return
    if (code) setMessage(linkErrorMessage(code, params.get('link_error_description') ?? code))
    if (done) setNotice(done === 'drive' ? 'Google account linked. Google Drive is connected too.' : 'Google account linked.')
    const next = new URLSearchParams(params)
    next.delete('link_error')
    next.delete('link_error_description')
    next.delete('linked')
    setParams(next, { replace: true })
  }, [params, setParams])

  async function handleLinkGoogle(): Promise<void> {
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      // Re-check on click: the identity may have been linked in another tab since this loaded.
      const current = await getLinkedGoogleIdentity()
      if (current) {
        setGoogle(current)
        setMessage('Google account is already linked.')
        return
      }
      markGoogleLinking()
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // Ask for Drive in the same consent, with a refresh token, so linking also connects
          // Google Drive and the import dialog does not need its own sign-in.
          scopes: GOOGLE_LINK_SCOPES,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            // Start Google on this account's address instead of an account chooser.
            ...(user?.email ? { login_hint: user.email } : {}),
          },
        },
      })
      if (error) {
        clearGoogleLinking()
        setMessage(linkErrorMessage(error.code, error.message))
      }
    } catch (err) {
      console.error('Link Google error', err)
      setMessage('Failed to link Google account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlink(): Promise<void> {
    if (!google) return
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const { error } = await supabase.auth.unlinkIdentity(google.identity)
      if (error) {
        setMessage(`Could not unlink Google: ${error.message}`)
      } else {
        setNotice('Google account unlinked. Google Drive stays connected until you disconnect it below.')
        await loadIdentity()
      }
    } catch (err) {
      console.error('Unlink Google error', err)
      setMessage('Could not unlink Google. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDriveDisconnect(): Promise<void> {
    setNotice('')
    await drive.disconnect()
    setNotice('Google Drive disconnected.')
  }

  return (
    <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-2 flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Connected accounts
      </h2>

      {/* Google sign-in (Supabase identity) */}
      <div className={`${ROW} border-b border-border`}>
        <div className="flex min-w-0 items-center gap-3">
          <GoogleLogo />
          <div className="min-w-0">
            <p className="text-sm font-medium">Google account</p>
            <p className="truncate text-xs text-muted-foreground">
              {google ? `Sign in with Google · ${google.email ?? 'linked'}` : 'Not linked'}
            </p>
          </div>
        </div>
        {google ? (
          google.canUnlink ? (
            <button type="button" disabled={busy} onClick={() => setConfirmUnlink(true)} className={DANGER_BUTTON}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Unlink'}
            </button>
          ) : (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600"
              title="Google is how this account signs in, so it can't be unlinked."
            >
              <Check className="w-3.5 h-3.5" /> Sign-in method
            </span>
          )
        ) : (
          <button type="button" disabled={busy} onClick={() => { void handleLinkGoogle() }} className={SECONDARY_BUTTON}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect Google'}
          </button>
        )}
      </div>

      {/* Google Drive (tokens stored by the server) */}
      <div className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <HardDrive className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm font-medium">Google Drive</p>
            <p className="truncate text-xs text-muted-foreground">
              {drive.loading ? 'Checking…' : drive.connected ? 'Connected for importing files' : 'Not connected'}
            </p>
          </div>
        </div>
        {drive.loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : drive.connected ? (
          <button type="button" onClick={() => setConfirmDriveOff(true)} className={DANGER_BUTTON}>
            Disconnect
          </button>
        ) : (
          <button type="button" onClick={() => { setNotice(''); void drive.connect() }} className={SECONDARY_BUTTON}>
            Connect Drive
          </button>
        )}
      </div>

      {notice && !message && <p role="status" className="mt-2 text-xs text-green-600">{notice}</p>}
      {(message || drive.error) && <p role="alert" className="mt-2 text-xs text-destructive">{message || drive.error}</p>}

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink your Google account?"
        confirmLabel="Unlink"
        destructive
        onCancel={() => setConfirmUnlink(false)}
        onConfirm={() => { setConfirmUnlink(false); void handleUnlink() }}
      >
        You won't be able to sign in with Google until you link it again. Google Drive is not affected.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDriveOff}
        title="Disconnect Google Drive?"
        confirmLabel="Disconnect"
        destructive
        onCancel={() => setConfirmDriveOff(false)}
        onConfirm={() => { setConfirmDriveOff(false); void handleDriveDisconnect() }}
      >
        IntelliDocs will no longer import from your Drive. Your Google sign-in stays linked.
      </ConfirmDialog>
    </section>
  )
}

function GoogleLogo(): JSX.Element {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}
