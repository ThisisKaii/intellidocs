import { useState, useEffect, type FormEvent } from 'react'
import { Check, ShieldCheck, QrCode, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ConfirmDialog } from './ConfirmDialog'

/** Two-Factor Authentication (TOTP via Supabase MFA). */
export function TwoFactorAuthSection(): JSX.Element {
  const { adoptCurrentSession } = useAuth()
  const [confirmOff, setConfirmOff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([])
  const [enrollData, setEnrollData] = useState<{
    factorId: string
    qrCode: string
    secret: string
  } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function loadFactors(): Promise<void> {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (!error && data) {
        const verifiedFactors = data.totp.filter((f) => f.status === 'verified')
        setFactors(verifiedFactors)
      }
    } catch (err) {
      console.error('Failed to list MFA factors', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFactors()
  }, [])

  async function startEnrollment(): Promise<void> {
    setActionLoading(true)
    setFeedback(null)
    try {
      // Clean up any stale unverified factors first
      const { data: factorsList } = await supabase.auth.mfa.listFactors()
      if (factorsList?.totp) {
        const unverified = factorsList.totp.filter((f) => f.status !== 'verified')
        for (const factor of unverified) {
          try {
            await supabase.auth.mfa.unenroll({ factorId: factor.id })
          } catch {
            // Ignore individual cleanup errors
          }
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) {
        setFeedback({ ok: false, text: error.message })
        return
      }
      if (data?.totp) {
        setEnrollData({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
        })
      }
    } catch {
      setFeedback({ ok: false, text: 'Failed to start 2FA enrollment.' })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancelEnrollment(): Promise<void> {
    if (enrollData) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId })
      } catch (err) {
        console.warn('Failed to unenroll unverified factor on cancel', err)
      }
      setEnrollData(null)
      setVerifyCode('')
      setFeedback(null)
    }
  }

  async function handleVerify(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!enrollData || verifyCode.trim().length !== 6) {
      setFeedback({ ok: false, text: 'Please enter a valid 6-digit authentication code.' })
      return
    }

    setActionLoading(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.factorId,
        code: verifyCode.trim(),
      })
      if (error) {
        setFeedback({ ok: false, text: error.message })
      } else {
        // The session just moved up to the 2FA level; the app must use those tokens from now on.
        await adoptCurrentSession()
        setFeedback({ ok: true, text: '2FA has been successfully enabled!' })
        setEnrollData(null)
        setVerifyCode('')
        void loadFactors()
      }
    } catch {
      setFeedback({ ok: false, text: 'Verification failed. Please check the code and try again.' })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDisable(factorId: string): Promise<void> {
    setActionLoading(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) {
        setFeedback({ ok: false, text: error.message })
      } else {
        setFeedback({ ok: true, text: '2FA disabled.' })
        void loadFactors()
      }
    } catch {
      setFeedback({ ok: false, text: 'Failed to disable 2FA.' })
    } finally {
      setActionLoading(false)
    }
  }

  const isEnabled = factors.length > 0

  return (
    <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" strokeWidth={1.75} />
          Two-Factor Authentication (2FA)
        </h2>
        {isEnabled && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2.5 py-1 rounded-full font-medium">
            <Check className="w-3.5 h-3.5" />
            Enabled
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Protect your account with an extra layer of security. Use an authenticator app (such as Google Authenticator or Authy) to generate one-time codes.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking 2FA status…
        </div>
      ) : isEnabled ? (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-foreground font-medium">
            Authenticator App is currently active
          </div>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => setConfirmOff(true)}
            className="inline-flex items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-medium transition-colors hover:bg-destructive/20 disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disable 2FA'}
          </button>
        </div>
      ) : enrollData ? (
        <div className="rounded-xl bg-secondary/50 border border-border p-4 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-white rounded-lg border border-border shrink-0">
              <img
                src={enrollData.qrCode}
                alt="2FA QR Code"
                className="w-32 h-32"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" />
                Scan this QR code
              </span>
              <span className="text-muted-foreground">
                Scan with Google Authenticator, 1Password, or Authy.
              </span>
              <span className="text-muted-foreground mt-1">
                Manual secret key:
              </span>
              <code className="bg-background px-2 py-1 rounded border border-border select-all font-mono text-[11px]">
                {enrollData.secret}
              </code>
            </div>
          </div>

          <form onSubmit={handleVerify} className="flex flex-col gap-3 pt-2 border-t border-border">
            <label htmlFor="verify-2fa" className="text-xs font-medium text-foreground">
              Enter 6-digit code from your app:
            </label>
            <div className="flex items-center gap-2">
              <input
                id="verify-2fa"
                type="text"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="settings-input w-32 tracking-widest text-center font-mono"
              />
              <button
                type="submit"
                disabled={actionLoading || verifyCode.length !== 6}
                className="btn-primary text-xs h-8 px-3"
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify & Activate'}
              </button>
              <button
                type="button"
                onClick={() => { void handleCancelEnrollment() }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => { void startEnrollment() }}
          className="btn-primary text-xs h-8 px-3 gap-1.5"
        >
          {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Enable Authenticator App
        </button>
      )}

      {feedback && (
        <p
          className={`text-xs mt-3 flex items-center gap-1.5 ${
            feedback.ok ? 'text-green-600' : 'text-destructive'
          }`}
        >
          {feedback.ok ? (
            <Check className="size-3.5" strokeWidth={2} />
          ) : (
            <AlertTriangle className="size-3.5" strokeWidth={2} />
          )}
          {feedback.text}
        </p>
      )}
      <ConfirmDialog
        open={confirmOff}
        title="Turn off two-factor authentication?"
        confirmLabel="Turn off"
        destructive
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => { setConfirmOff(false); void handleDisable(factors[0].id) }}
      >
        Your account will be protected by your password only.
      </ConfirmDialog>
    </section>
  )
}
