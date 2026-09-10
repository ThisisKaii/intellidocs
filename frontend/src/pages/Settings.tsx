import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Mail,
  Shield,
  UserCog,
  Lock,
  Link2,
  ShieldCheck,
  QrCode,
  Loader2,
  AlertTriangle,
  GraduationCap,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/services/api'
import { supabase } from '@/lib/supabase'
import {
  getEditorPreferences,
  setEditorPreferences,
  type EditorPreferences,
} from '@/lib/editorPreferences'

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  professor: 'Professor',
  admin: 'Admin',
}

/** Verification status shown for professor accounts. */
function verificationLabel(status: string | undefined): string {
  switch (status) {
    case 'pending':
      return 'Pending review'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Not applicable'
  }
}

/** Main account and security settings page. */
export default function SettingsPage(): JSX.Element {
  const { user, updateUser } = useAuth()

  const role = user?.role ?? 'student'
  const isProfessor = role === 'professor'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
          Back to Documents
        </Link>

        <h1 className="text-2xl font-semibold mt-4 mb-6">Settings</h1>

        <div className="flex flex-col gap-6">
          {/* 1. Display Name / Profile */}
          <ManageProfileSection userDisplayName={user?.displayName ?? ''} onSaved={updateUser} />

          {/* 2. Account Information */}
          <section className="rounded-2xl bg-card border border-border p-6">
            <h2 className="text-base font-medium mb-4 flex items-center gap-2">
              <UserCog className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Account Info
            </h2>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-muted-foreground w-28 shrink-0">Email</span>
                <span className="text-sm text-foreground break-all">{user?.email ?? '—'}</span>
              </div>

              <div className="flex items-center gap-3">
                <Shield className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-muted-foreground w-28 shrink-0">Role</span>
                <span className="text-sm text-foreground capitalize">
                  {ROLE_LABELS[role] ?? role}
                </span>
              </div>

              {isProfessor && (
                <div className="flex items-center gap-3">
                  <span className="size-4 shrink-0" />
                  <span className="text-sm text-muted-foreground w-28 shrink-0">
                    Verification
                  </span>
                  <span className="text-sm text-foreground capitalize">
                    {verificationLabel(user?.verificationStatus)}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* 3. Faculty Application (visible to students and pending professors) */}
          <FacultyApplicationSection
            role={role}
            verificationStatus={user?.verificationStatus}
          />

          {/* 4. Change Password */}
          <ChangePasswordSection />

          {/* 5. Connected Accounts (Google) */}
          <ConnectedAccountsSection />

          {/* 6. Editor & AI personalization */}
          <EditorPersonalizationSection />

          {/* 7. Two-Factor Authentication (2FA) */}
          <TwoFactorAuthSection />
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Account authentication and multi-factor security are managed securely via Supabase Auth.
        </p>
      </div>
    </div>
  )
}

/** Editable display-name form; persists via PATCH /auth/profile. */
function ManageProfileSection({
  userDisplayName,
  onSaved,
}: {
  userDisplayName: string
  onSaved: (patch: { displayName?: string | null }) => void
}): JSX.Element {
  const [displayName, setDisplayName] = useState(userDisplayName)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) {
      setFeedback({ ok: false, text: 'Display name cannot be empty' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await api.auth.updateProfile(trimmed)
      onSaved({ displayName: res.user.displayName })
      setDisplayName(res.user.displayName ?? '')
      setFeedback({ ok: true, text: res.message })
    } catch {
      setFeedback({ ok: false, text: 'Failed to update profile. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Manage Profile
      </h2>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="display-name" className="text-sm text-muted-foreground">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            className="max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {feedback && (
          <p
            className={`text-sm flex items-center gap-1.5 ${
              feedback.ok ? 'text-green-600' : 'text-destructive'
            }`}
          >
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  )
}

/** Faculty verification application section. Visible to students and pending professors. */
function FacultyApplicationSection({
  role,
  verificationStatus,
}: {
  role: string
  verificationStatus?: string
}): JSX.Element {
  const [college, setCollege] = useState('')
  const [department, setDepartment] = useState('')
  const [institutionalEmail, setInstitutionalEmail] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const isPending = role === 'professor' && verificationStatus === 'pending'
  const isApproved = role === 'professor' && verificationStatus === 'approved'
  const isRejected = role === 'professor' && verificationStatus === 'rejected'

  if (isApproved) {
    return (
      <section className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-base font-medium mb-2 flex items-center gap-2">
          <GraduationCap className="size-4 text-green-600" strokeWidth={1.75} />
          Faculty Status
        </h2>
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <Check className="size-4" strokeWidth={2} />
          Your professor application has been approved. You have full educator access.
        </p>
      </section>
    )
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setFeedback(null)
    setSaving(true)
    try {
      const res = await api.auth.applyProfessor({
        college: college.trim(),
        department: department.trim(),
        institutionalEmail: institutionalEmail.trim(),
        facultyId: facultyId.trim(),
        reason: reason.trim(),
      })
      setFeedback({ ok: true, text: res.message })
      setCollege('')
      setDepartment('')
      setInstitutionalEmail('')
      setFacultyId('')
      setReason('')
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to submit application',
      })
    } finally {
      setSaving(false)
    }
  }

  if (isPending) {
    return (
      <section className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-base font-medium mb-2 flex items-center gap-2">
          <GraduationCap className="size-4 text-yellow-600" strokeWidth={1.75} />
          Faculty Application
        </h2>
        <p className="text-sm text-yellow-600 flex items-center gap-1.5">
          <AlertTriangle className="size-4" strokeWidth={2} />
          Your professor application is under review by an administrator. You will be notified once a decision is made.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <h2 className="text-base font-medium mb-2 flex items-center gap-2">
        <GraduationCap className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Apply for Faculty Access
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Submit your credentials to apply for a Professor account. Administrator approval is required to unlock educator features such as document review, grading, and compliance auditing.
      </p>

      {isRejected && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 mb-4">
          <p className="text-xs text-destructive">
            Your previous application was not approved. You may re-apply with updated credentials.
          </p>
        </div>
      )}

      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="college" className="text-sm text-muted-foreground">College</label>
            <input
              id="college"
              type="text"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="e.g. College of Computer Studies"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="department" className="text-sm text-muted-foreground">Department</label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Computer Science"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="inst-email" className="text-sm text-muted-foreground">Institutional Email</label>
            <input
              id="inst-email"
              type="email"
              value={institutionalEmail}
              onChange={(e) => setInstitutionalEmail(e.target.value)}
              placeholder="professor@university.edu"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="faculty-id" className="text-sm text-muted-foreground">Faculty ID Number</label>
            <input
              id="faculty-id"
              type="text"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              placeholder="e.g. FAC-2026-001"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="reason" className="text-sm text-muted-foreground">Reason for Application</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly describe your role and why you need faculty access..."
            required
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
        </div>

        {feedback && (
          <p className={`text-sm flex items-center gap-1.5 ${feedback.ok ? 'text-green-600' : 'text-destructive'}`}>
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {!feedback.ok && <AlertTriangle className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Submitting…' : 'Submit Application'}
        </button>
      </form>
    </section>
  )
}


/** Form to update user password securely via Supabase Auth. */
function ChangePasswordSection(): JSX.Element {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function handlePasswordChange(e: FormEvent): Promise<void> {
    e.preventDefault()
    setFeedback(null)

    if (newPassword.length < 8) {
      setFeedback({ ok: false, text: 'Password must be at least 8 characters long.' })
      return
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ ok: false, text: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setFeedback({ ok: false, text: error.message })
      } else {
        setFeedback({ ok: true, text: 'Password updated successfully.' })
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setFeedback({ ok: false, text: 'An unexpected error occurred while updating password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Lock className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Change Password
      </h2>

      <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="new-password" className="text-sm text-muted-foreground">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-password" className="text-sm text-muted-foreground">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {feedback && (
          <p
            className={`text-sm flex items-center gap-1.5 ${
              feedback.ok ? 'text-green-600' : 'text-destructive'
            }`}
          >
            {feedback.ok && <Check className="size-4" strokeWidth={2} />}
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </section>
  )
}

/** Manage Google and OAuth provider accounts. */
function ConnectedAccountsSection(): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)

  useEffect(() => {
    async function checkIdentities(): Promise<void> {
      try {
        const { data } = await supabase.auth.getUser()
        const identities = data?.user?.identities ?? []
        const isGoogle = identities.some(
          (id) => id.provider?.toLowerCase() === 'google'
        )
        setGoogleConnected(isGoogle)
      } catch (err) {
        console.error('Failed to check OAuth identities', err)
        setGoogleConnected(false)
      }
    }
    void checkIdentities()
  }, [])

  async function handleLinkGoogle(): Promise<void> {
    setLoading(true)
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        alert(`Failed to link Google account: ${error.message}`)
      }
    } catch (err) {
      console.error('Link Google error', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Connected Accounts
      </h2>

      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium">Google</p>
            <p className="text-xs text-muted-foreground">
              {googleConnected ? 'Linked to this account' : 'Not linked'}
            </p>
          </div>
        </div>

        {googleConnected ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2.5 py-1 rounded-full font-medium">
            <Check className="w-3.5 h-3.5" />
            Connected
          </span>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => { void handleLinkGoogle() }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect Google'}
          </button>
        )}
      </div>
    </section>
  )
}

/** Two-Factor Authentication (TOTP via Supabase MFA). */
function TwoFactorAuthSection(): JSX.Element {
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
    if (!window.confirm('Are you sure you want to disable Two-Factor Authentication?')) {
      return
    }
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
    <section className="rounded-2xl bg-card border border-border p-6">
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
            onClick={() => { void handleDisable(factors[0].id) }}
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
                className="w-32 tracking-widest text-center rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={actionLoading || verifyCode.length !== 6}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
    </section>
  )
}

/** Persisted editor & AI preferences: underline style, sensitivity, highlight color. */
function EditorPersonalizationSection(): JSX.Element {
  const [prefs, setPrefs] = useState(() => getEditorPreferences())

  function update(next: Partial<EditorPreferences>): void {
    setPrefs(setEditorPreferences(next))
  }

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Editor &amp; AI
      </h2>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Suggestion underline style</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'straight', label: 'Straight lines' },
                { value: 'wavy', label: 'Wavy lines' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ underlineStyle: option.value })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium border transition-colors cursor-pointer ${
                  prefs.underlineStyle === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Grammar issues underline in red, spelling issues in amber.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Suggestion sensitivity</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'low', label: 'Fewer tips', threshold: '≥55%' },
                { value: 'medium', label: 'Balanced', threshold: '≥68%' },
                { value: 'high', label: 'More tips', threshold: '≥80%' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ sensitivity: option.value })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm border transition-colors cursor-pointer ${
                  prefs.sensitivity === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs opacity-80">{option.threshold}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Highlight color</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'indigo', swatch: '#6366f1' },
                { value: 'purple', swatch: '#7c3aed' },
                { value: 'emerald', swatch: '#059669' },
                { value: 'amber', swatch: '#d97706' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.value}
                onClick={() => update({ highlightColor: option.value })}
                aria-label={`Highlight color ${option.value}`}
                className="rounded-full p-1 border transition-transform cursor-pointer hover:scale-110"
                style={{
                  backgroundColor: option.swatch,
                  borderColor: prefs.highlightColor === option.value ? 'var(--foreground)' : 'transparent',
                  boxShadow: prefs.highlightColor === option.value ? '0 0 0 2px var(--card)' : undefined,
                }}
              >
                <span className="block size-6 rounded-full" />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Used for in-canvas formatting suggestion highlights and the suggestion pulse.
          </p>
        </div>
      </div>
    </section>
  )
}
