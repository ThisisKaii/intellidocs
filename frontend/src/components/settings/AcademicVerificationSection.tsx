import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, BookOpen, Check, GraduationCap, HardDrive } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/services/api'
import type { RoleName } from '@/types/admin'
import { FacultyApplicationSection } from '@/components/settings/FacultyApplicationSection'

type AcademicRole = 'student' | 'professor'

/** What each verified role unlocks, shown on the picker. */
const ROLE_PERKS: Record<AcademicRole, { title: string; quota: string; perk: string; icon: typeof BookOpen }> = {
  student: { title: 'Student', quota: '25 MB storage', perk: 'Thesis presets (UCLM Capstone)', icon: BookOpen },
  professor: { title: 'Professor', quota: '50 MB storage', perk: 'Review, grading and originality tools', icon: GraduationCap },
}

/** Storage each role gets, mirroring the server's STORAGE_QUOTA_BYTES. */
const ROLE_QUOTA: Record<RoleName, string> = { user: '10 MB', student: '25 MB', professor: '50 MB', admin: '100 MB' }

/** Student verification form: the applicant keeps the baseline role until an admin approves. */
function StudentApplicationForm({ rejected }: { rejected: boolean }): JSX.Element {
  const { refreshRole } = useAuth()
  const [studentId, setStudentId] = useState('')
  const [college, setCollege] = useState('')
  const [degreeProgram, setDegreeProgram] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [decisionNote, setDecisionNote] = useState<string | null>(null)

  useEffect(() => {
    if (!rejected) return
    api.auth.applicationStatus().then((status) => setDecisionNote(status.decisionNote)).catch(() => setDecisionNote(null))
  }, [rejected])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setFeedback(null)
    setSaving(true)
    try {
      const res = await api.auth.applyStudent({
        studentId: studentId.trim(),
        college: college.trim(),
        degreeProgram: degreeProgram.trim(),
      })
      setFeedback({ ok: true, text: res.message })
      void refreshRole()
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Failed to submit application' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
      {rejected && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-xs text-destructive">Your previous application was not approved. You may re-apply with updated details.</p>
          {decisionNote && <p className="mt-1 text-xs text-destructive">Administrator note: {decisionNote}</p>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="student-id" className="text-sm text-muted-foreground">Student ID number</label>
          <input id="student-id" type="text" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. 2026-00123" required maxLength={50} className="settings-input w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="student-college" className="text-sm text-muted-foreground">College</label>
          <input id="student-college" type="text" value={college} onChange={(e) => setCollege(e.target.value)} placeholder="e.g. College of Computer Studies" required maxLength={200} className="settings-input w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="degree-program" className="text-sm text-muted-foreground">Degree program</label>
        <input id="degree-program" type="text" value={degreeProgram} onChange={(e) => setDegreeProgram(e.target.value)} placeholder="e.g. BS Computer Science" required maxLength={200} className="settings-input w-full" />
      </div>
      {feedback && (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${feedback.ok ? 'text-green-600' : 'text-destructive'}`}>
          {feedback.ok ? <Check className="size-4" strokeWidth={2} /> : <AlertTriangle className="size-4" strokeWidth={2} />}
          {feedback.text}
        </p>
      )}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Submitting…' : 'Apply for student verification'}
      </button>
    </form>
  )
}

/**
 * "Apply for Academic Verification": baseline users pick Student or Professor and submit
 * credentials. The role (and its quota) changes only after an administrator approves.
 */
export function AcademicVerificationSection({
  role,
  verificationStatus,
  requestedRole,
}: {
  role: RoleName
  verificationStatus?: string
  requestedRole: RoleName | null
}): JSX.Element {
  const isVerifiedAcademic = (role === 'student' || role === 'professor') && verificationStatus === 'approved'
  const studentAvailable = role === 'user'
  const pendingRole: AcademicRole | null =
    verificationStatus === 'pending' && (requestedRole === 'student' || requestedRole === 'professor') ? requestedRole : null
  const [choice, setChoice] = useState<AcademicRole>(pendingRole ?? (studentAvailable ? 'student' : 'professor'))
  const rejectedStudent = verificationStatus === 'rejected' && requestedRole === 'student'

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-base font-medium">
          <GraduationCap className="size-4 text-muted-foreground" strokeWidth={1.75} />
          Academic verification
        </h2>
        <p className="mb-4 text-xs text-muted-foreground text-pretty">
          New accounts start on the basic tier. Verify as a student or professor to raise your storage and unlock academic tools. An administrator reviews every application.
        </p>
        <p className="mb-4 flex items-center gap-2 text-sm">
          <HardDrive className="size-4 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-muted-foreground">Current tier:</span>
          <span className="font-medium capitalize">{role === 'user' ? 'Basic' : role}</span>
          <span className="tabular-nums text-muted-foreground">· {ROLE_QUOTA[role]}</span>
        </p>

        {pendingRole === 'student' ? (
          <p className="flex items-center gap-1.5 text-sm text-yellow-600">
            <AlertTriangle className="size-4" strokeWidth={2} />
            Your student application is under review. You keep the basic tier until it is approved.
          </p>
        ) : !isVerifiedAcademic || role === 'student' ? (
          <div role="radiogroup" aria-label="Role to apply for" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['student', 'professor'] as const).map((option) => {
              const perks = ROLE_PERKS[option]
              const disabled = option === 'student' && !studentAvailable
              const selected = choice === option && !disabled
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setChoice(option)}
                  className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/60'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <perks.icon className="size-4" strokeWidth={1.75} /> {perks.title}
                    {disabled && <Check aria-label="Already verified" className="size-3.5 text-green-600" />}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{perks.quota}</span>
                  <span className="text-xs text-muted-foreground">{perks.perk}</span>
                </button>
              )
            })}
          </div>
        ) : null}

        {studentAvailable && choice === 'student' && pendingRole === null && (
          <div className="mt-5">
            <StudentApplicationForm rejected={rejectedStudent} />
          </div>
        )}
      </section>

      {(choice === 'professor' || !studentAvailable) && pendingRole !== 'student' && (
        <FacultyApplicationSection role={role} verificationStatus={verificationStatus} requestedRole={requestedRole} />
      )}
    </div>
  )
}
