import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, UserPlus, Users, X } from 'lucide-react'
import { api, type ClassEnrollmentRecord, type FolderRecord } from '@/services/api'
import JoinCodeBadge from './JoinCodeBadge'

interface ClassRosterModalProps {
  folder: FolderRecord
  onClose: () => void
  onChanged?: () => void
}

/** Show the enrolled date as a short readable string, falling back to raw text. */
function formatEnrolled(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Manage the student roster of a class folder: list who is enrolled, add a
 * student by their IntelliDocs account email, and remove a student.
 * The backend derives the student id from the email, so a professor only ever
 * needs to know an address, never an internal user id.
 */
export function ClassRosterModal({
  folder,
  onClose,
  onChanged,
}: ClassRosterModalProps): JSX.Element {
  const [roster, setRoster] = useState<ClassEnrollmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  const loadRoster = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setRoster(await api.folders.roster(folder.folder_id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class roster')
    } finally {
      setLoading(false)
    }
  }, [folder.folder_id])

  useEffect(() => {
    void loadRoster()
  }, [loadRoster])

  /** Add a student by email, then show them in the list immediately. */
  async function handleEnroll(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setBusy(true)
    setError('')
    try {
      const created = await api.folders.enroll(folder.folder_id, trimmed)
      setRoster((current) =>
        current.some((row) => row.student_id === created.student_id)
          ? current
          : [...current, created],
      )
      setEmail('')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll student')
    } finally {
      setBusy(false)
      emailRef.current?.focus()
    }
  }

  /** Remove a student, keeping the list in step if the call succeeds. */
  async function handleUnenroll(studentId: string): Promise<void> {
    setBusy(true)
    setError('')
    const previous = roster
    setRoster((current) => current.filter((row) => row.student_id !== studentId))
    try {
      await api.folders.unenroll(folder.folder_id, studentId)
      onChanged?.()
    } catch (err) {
      setRoster(previous)
      setError(err instanceof Error ? err.message : 'Failed to remove student')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Class roster"
      className="animate-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="animate-modal"
        style={{
          width: '100%',
          maxWidth: '30rem',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          padding: '1.5rem',
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            gap: '1rem',
          }}
        >
          <div>
            <h2 className="font-display" style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>{folder.name}</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
              {folder.class_code || 'Class'}
              {folder.academic_term ? ` · ${folder.academic_term}` : ''} · {roster.length}{' '}
              {roster.length === 1 ? 'student' : 'students'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: busy ? 'default' : 'pointer',
              padding: '0.25rem',
              borderRadius: '0.375rem',
              display: 'flex',
            }}
          >
            <X className="size-4" />
          </button>
        </div>

        <div style={{ marginBottom: '1rem' }}><JoinCodeBadge folder={folder} /></div>
        <form onSubmit={handleEnroll} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            placeholder="student@uclm.edu.ph"
            aria-label="Student email"
            disabled={busy}
            style={{
              flex: 1,
              minWidth: 0,
              height: '38px',
              borderRadius: '0.5rem',
              border: 'none',
              boxShadow: '0px 0px 0px 1px var(--border-shadow)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              padding: '0 0.75rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold border-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Enroll
          </button>
        </form>

        {error && (
          <p
            role="alert"
            style={{
              margin: '0 0 0.75rem',
              fontSize: '0.8125rem',
              color: 'var(--destructive)',
            }}
          >
            {error}
          </p>
        )}

        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading roster
            </div>
          ) : roster.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No students enrolled yet</p>
              <p className="text-xs text-muted-foreground">
                Add a student above using their IntelliDocs account email.
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {roster.map((row) => (
                <li
                  key={row.student_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0.25rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center size-8 shrink-0 rounded-full bg-secondary text-foreground text-xs font-bold"
                  >
                    {(row.display_name || row.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span
                      className="block text-sm font-medium text-foreground truncate"
                      title={row.display_name ?? undefined}
                    >
                      {row.display_name || row.email || 'Unnamed student'}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate" title={row.email ?? undefined}>
                      {row.email ?? 'No email on file'}
                      {formatEnrolled(row.enrolled_at) ? ` · joined ${formatEnrolled(row.enrolled_at)}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnenroll(row.student_id)}
                    disabled={busy}
                    aria-label={`Remove ${row.display_name || row.email || 'student'}`}
                    title="Remove from class"
                    className="flex items-center justify-center size-8 shrink-0 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
