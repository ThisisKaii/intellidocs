import { useState, useEffect, type FormEvent } from 'react'
import { Check, AlertTriangle, GraduationCap, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/services/api'

/** Faculty verification application section. Visible to students and pending professors. */
export function FacultyApplicationSection({
  role,
  verificationStatus,
  requestedRole,
}: {
  role: string
  verificationStatus?: string
  requestedRole: string | null
}): JSX.Element {
  const [college, setCollege] = useState('')
  const [department, setDepartment] = useState('')
  const [institutionalEmail, setInstitutionalEmail] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [reason, setReason] = useState('')
  const [facultyIdFile, setFacultyIdFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const { refreshRole } = useAuth()

  useEffect(() => {
    if (!facultyIdFile || !facultyIdFile.type.startsWith('image/')) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(facultyIdFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [facultyIdFile])

  const appliedForProfessor = requestedRole === 'professor' || role === 'professor'
  const isPending = appliedForProfessor && verificationStatus === 'pending'
  const isApproved = role === 'professor' && verificationStatus === 'approved'
  const isRejected = appliedForProfessor && verificationStatus === 'rejected'
  const [decisionNote, setDecisionNote] = useState<string | null>(null)

  // The administrator's note on a rejected application, so the applicant knows what to fix.
  useEffect(() => {
    if (!isRejected) return
    api.auth.applicationStatus().then((status) => setDecisionNote(status.decisionNote)).catch(() => setDecisionNote(null))
  }, [isRejected])

  if (isApproved) {
    return (
      <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
        <h2 className="text-base font-medium mb-2 flex items-center gap-2">
          <GraduationCap className="size-4 text-green-600" strokeWidth={1.75} />
          Faculty status
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
        facultyIdImage: facultyIdFile,
      })
      setFeedback({ ok: true, text: res.message })
      // Pick up the new pending status straight away so the form is replaced by
      // the "awaiting review" state without waiting for a poll or a reload.
      void refreshRole()
      setCollege('')
      setDepartment('')
      setInstitutionalEmail('')
      setFacultyId('')
      setReason('')
      setFacultyIdFile(null)
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
      <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
        <h2 className="text-base font-medium mb-2 flex items-center gap-2">
          <GraduationCap className="size-4 text-yellow-600" strokeWidth={1.75} />
          Faculty application
        </h2>
        <p className="text-sm text-yellow-600 flex items-center gap-1.5">
          <AlertTriangle className="size-4" strokeWidth={2} />
          Your professor application is under review by an administrator. You will be notified once a decision is made.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-2 flex items-center gap-2">
        <GraduationCap className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Apply for faculty access
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Submit your credentials to apply for a Professor account. Administrator approval is required to unlock educator features such as document review, grading, and compliance auditing.
      </p>

      {isRejected && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 mb-4">
          <p className="text-xs text-destructive">
            Your previous application was not approved. You may re-apply with updated credentials.
          </p>
          {decisionNote && <p className="text-xs text-destructive mt-1">Administrator note: {decisionNote}</p>}
        </div>
      )}

      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="college" className="text-sm text-muted-foreground">College</label>
            <input
              id="college"
              type="text"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="e.g. College of Computer Studies"
              required
              className="settings-input w-full"
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
              className="settings-input w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="inst-email" className="text-sm text-muted-foreground">Institutional Email</label>
            <input
              id="inst-email"
              type="email"
              value={institutionalEmail}
              onChange={(e) => setInstitutionalEmail(e.target.value)}
              placeholder="professor@university.edu"
              required
              className="settings-input w-full"
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
              className="settings-input w-full"
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
            className="settings-input w-full resize-none"
          />
        </div>

        {/* Faculty ID Upload */}
        <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-dashed border-border bg-secondary/30">
          <div className="flex items-center justify-between">
            <label htmlFor="faculty-id-file" className="text-sm font-medium text-foreground flex items-center gap-2">
              <Upload className="size-4 text-primary" /> Faculty ID / Employment Proof
            </label>
            {facultyIdFile && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check className="size-3.5" /> File ready
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground m-0">
            Upload a clear photo or scan of your institutional Faculty ID (PNG, JPG, WebP, or PDF, up to 10 MB) for administrator review.
          </p>
          <input
            id="faculty-id-file"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
            required
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFacultyIdFile(f)
            }}
            className="text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
          />
          {facultyIdFile && (
            <div className="mt-1 flex flex-col gap-2">
              <p className="text-xs font-mono text-muted-foreground m-0">
                Selected: {facultyIdFile.name} ({(facultyIdFile.size / 1024).toFixed(1)} KB)
              </p>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Faculty ID preview"
                  className="max-h-40 w-fit rounded-lg border border-border object-contain bg-background"
                />
              )}
            </div>
          )}
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
          className="btn-primary"
        >
          {saving ? 'Submitting…' : 'Submit Application'}
        </button>
      </form>
    </section>
  )
}
