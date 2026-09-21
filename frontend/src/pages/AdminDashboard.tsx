import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../services/api'
import {
  Shield,
  UserCheck,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  BarChart3,
  Trash2,
  RefreshCw,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Download,
  BookOpen,
  Search,
  GraduationCap,
  Briefcase,
} from 'lucide-react'
import {
  AdminApplicant,
  AdminDocumentRecord,
  AdminUserRecord,
  RoleName,
  SystemReport,
} from '../types/admin'

const roleLabels: Record<RoleName, string> = {
  student: 'Student',
  professor: 'Professor',
  admin: 'Administrator',
}

const roleIds: Record<RoleName, number> = { student: 1, professor: 2, admin: 3 }

/** Compact "3h ago" relative timestamp for review cards. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return 'just now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AdminDashboard(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'verification' | 'users' | 'reports' | 'moderation' | 'research'>('verification')
  const [applicants, setApplicants] = useState<AdminApplicant[]>([])
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [reports, setReports] = useState<SystemReport | null>(null)
  const [documents, setDocuments] = useState<AdminDocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  /** Show a floating popup notification that auto-dismisses after 4 seconds. */
  function showToast(type: 'success' | 'error', text: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast({ type, text })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000)
  }

  const [roleFilter, setRoleFilter] = useState<'all' | RoleName>('all')
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')
  const [userSearch, setUserSearch] = useState('')
  const [moderationQuery, setModerationQuery] = useState('')
  const [moderationActiveQuery, setModerationActiveQuery] = useState('')

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadApplicants() {
    try {
      const list = await api.admin.getPendingApplicants()
      setApplicants(list)
    } catch (err) {
      console.error('Failed to load pending applicants', err)
      showToast('error', 'Failed to load pending applications')
    }
  }

  async function loadUsers() {
    try {
      setUsers(await api.admin.getAllUsers())
    } catch (err) {
      console.error('Failed to load users', err)
    }
  }

  async function loadReports() {
    try {
      setReports(await api.admin.getSystemReports())
    } catch (err) {
      console.error('Failed to load reports', err)
    }
  }

  async function loadDocuments() {
    try {
      setDocuments(await api.admin.getAllDocuments())
    } catch (err) {
      console.error('Failed to load documents', err)
    }
  }

  /**
   * Load every dashboard module independently so a slow or failing source
   * (e.g. telemetry reports) can never blank out the whole console.
   * Only the fast sources gate the Refresh button; reports load in the background.
   */
  async function loadData() {
    setLoading(true)
    await Promise.allSettled([loadApplicants(), loadUsers(), loadDocuments()])
    setLoading(false)
    void loadReports()
  }

  async function loadModeration(query?: string) {
    setActionLoading('search')
    try {
      const docs = await api.admin.getAllDocuments(query ?? moderationActiveQuery)
      setDocuments(docs)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleVerifyApplicant(applicant: AdminApplicant, status: 'approved' | 'rejected') {
    let notes: string | undefined
    if (status === 'rejected') {
      notes = window.prompt('Rejection reason (shown to the applicant):', '') ?? undefined
      if (notes === undefined) return
    }
    setActionLoading(applicant.user_id)
    try {
      await api.admin.verifyApplicant(applicant.user_id, { status, role: applicant.applied_role, notes })
      showToast('success', `${roleLabels[applicant.applied_role]} application ${status === 'approved' ? 'approved' : 'rejected'} successfully.`)
      await loadData()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Verification action failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRoleOverride(userId: string, role: RoleName) {
    setActionLoading(userId)
    try {
      await api.admin.updateUserRole(userId, roleIds[role])
      showToast('success', `Role updated to ${roleLabels[role]}.`)
      await loadData()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Role update failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!window.confirm('Are you sure you want to permanently delete this document as moderator?')) {
      return
    }
    setActionLoading(documentId)
    try {
      await api.admin.deleteDocument(documentId)
      showToast('success', 'Document deleted successfully by Admin moderator.')
      await loadData()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete document')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExportEmpiricalData() {
    setExportLoading(true)
    try {
      const blob = await api.admin.exportEmpiricalData()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `intellidocs_research_dataset_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
      showToast('success', 'Research dataset exported successfully.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const queued = [...applicants]
    .filter((a) => roleFilter === 'all' || a.applied_role === roleFilter)
    .sort((a, b) =>
      sortOrder === 'oldest'
        ? new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime()
        : new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
    )

  const filteredUsers = users.filter((u) => {
    const term = userSearch.trim().toLowerCase()
    if (!term) return true
    return [u.display_name, u.email, u.user_id, u.role_name, u.verification_status]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(term))
  })

  const pendingCount = applicants.length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Top Navbar */}
      <header style={{ height: '56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', backgroundColor: 'var(--background)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '0.375rem',
              color: 'var(--muted-foreground)',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft style={{ width: '16px', height: '16px' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>IntelliDocs Admin Console</span>
          </div>
        </div>

        <Link
          to="/dashboard"
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
          }}
        >
          Exit to Dashboard
        </Link>
      </header>

      <main style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
              >
                <Shield style={{ width: '18px', height: '18px' }} />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                Administrator Dashboard
              </h1>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0 }}>
              Verify Students &amp; Faculty, manage users, monitor platform telemetry, moderate documents, and export research data.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              height: '36px',
              padding: '0 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw style={{ width: '14px', height: '14px' }} />
            Refresh Data
          </button>
        </div>

        {/* Quick stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Pending Verifications</span>
              <Clock style={{ width: '16px', height: '16px', color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: pendingCount > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
              {pendingCount}
            </div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Total Registered Users</span>
              <Users style={{ width: '16px', height: '16px' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{reports?.totalUsers ?? users.length}</div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Active Documents</span>
              <FileText style={{ width: '16px', height: '16px' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{reports?.activeDocuments ?? documents.length}</div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Suggestion Acceptance</span>
              <BarChart3 style={{ width: '16px', height: '16px' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{reports?.feedback.acceptanceRate ?? '—'}</div>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('verification')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'verification' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'verification' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <UserCheck style={{ width: '16px', height: '16px' }} />
            Verification Queue ({pendingCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'users' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'users' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Users style={{ width: '16px', height: '16px' }} />
            User Management ({users.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'reports' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'reports' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <BarChart3 style={{ width: '16px', height: '16px' }} />
            System Reports
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('moderation')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'moderation' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'moderation' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangle style={{ width: '16px', height: '16px' }} />
            Moderation ({documents.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('research')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'research' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'research' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <BookOpen style={{ width: '16px', height: '16px' }} />
            Research Data
          </button>
        </div>

        {/* Tab 1: Dual-Role Verification Queue */}
        {activeTab === 'verification' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
              Dual-Role Verification Queue
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1.25rem' }}>
              Review submitted identity credentials for Student quotas and Faculty permissions.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | RoleName)}
                style={{
                  height: '34px',
                  padding: '0 0.625rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontFamily: 'inherit',
                }}
              >
                <option value="all">All Roles</option>
                <option value="professor">Professor</option>
                <option value="student">Student</option>
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')}
                style={{
                  height: '34px',
                  padding: '0 0.625rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontFamily: 'inherit',
                }}
              >
                <option value="oldest">Oldest First</option>
                <option value="newest">Newest First</option>
              </select>
            </div>

            {queued.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted-foreground)' }}>
                <CheckCircle2 style={{ width: '36px', height: '36px', color: 'var(--success)', margin: '0 auto 0.75rem' }} />
                <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 500 }}>No pending applications</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
                  All Student and Professor verification requests have been reviewed.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {queued.map((applicant) => {
                  const isProfessor = applicant.applied_role === 'professor'
                  const details = applicant.application_details
                  return (
                    <div
                      key={applicant.user_id}
                      style={{
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--background)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '9999px',
                              backgroundColor: isProfessor
                                ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                                : 'color-mix(in srgb, var(--success) 12%, transparent)',
                              color: isProfessor ? 'var(--primary)' : 'var(--success)',
                            }}
                          >
                            {isProfessor ? (
                              <Briefcase style={{ width: '14px', height: '14px' }} />
                            ) : (
                              <GraduationCap style={{ width: '14px', height: '14px' }} />
                            )}
                            {isProfessor ? 'Professor Application' : 'Student Verification'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                            Pending: {timeAgo(applicant.applied_at)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)', fontWeight: 600 }}>
                            PENDING
                          </span>
                        </div>
                      </div>

                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 0.125rem' }}>
                        {applicant.display_name || 'Unnamed User'}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.75rem' }}>
                        {applicant.email || applicant.user_id}
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.375rem 1rem', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                        <div><span style={{ color: 'var(--muted-foreground)' }}>College:</span> {details.college || '—'}</div>
                        {isProfessor ? (
                          <>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>Department:</span> {details.department || '—'}</div>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>Faculty ID:</span> {details.facultyId || '—'}</div>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>Institutional Email:</span> {details.institutionalEmail || '—'}</div>
                          </>
                        ) : (
                          <>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>Degree Program:</span> {details.degreeProgram || '—'}</div>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>Student ID:</span> {details.studentId || '—'}</div>
                          </>
                        )}
                      </div>

                      {details.reason && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1rem' }}>
                          <span style={{ color: 'var(--muted-foreground)' }}>Stated Purpose:</span> &ldquo;{details.reason}&rdquo;
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void handleVerifyApplicant(applicant, 'rejected')}
                          disabled={actionLoading === applicant.user_id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            height: '32px',
                            padding: '0 0.875rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--border)',
                            backgroundColor: 'transparent',
                            color: 'var(--error)',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <XCircle style={{ width: '14px', height: '14px' }} />
                          Reject Application
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleVerifyApplicant(applicant, 'approved')}
                          disabled={actionLoading === applicant.user_id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            height: '32px',
                            padding: '0 0.875rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            backgroundColor: 'var(--success)',
                            color: '#fff',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <CheckCircle2 style={{ width: '14px', height: '14px' }} />
                          Approve Role
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: System User Management */}
        {activeTab === 'users' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
              System Registered Users
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1rem' }}>
              Search by name, email, role, or verification status. Admins may override roles directly.
            </p>

            <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: '360px' }}>
              <Search style={{ width: '15px', height: '15px', position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users…"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 0.75rem 0 2.25rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                    <th style={{ padding: '0.75rem' }}>Profile</th>
                    <th style={{ padding: '0.75rem' }}>Email</th>
                    <th style={{ padding: '0.75rem' }}>Role</th>
                    <th style={{ padding: '0.75rem' }}>Documents</th>
                    <th style={{ padding: '0.75rem' }}>Created At</th>
                    <th style={{ padding: '0.75rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                        {u.display_name || u.user_id}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
                        {u.email || '—'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {u.role_name ? roleLabels[u.role_name] : `Role ${u.role_id}`}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
                        {u.document_count}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <select
                          value={u.role_name ?? ''}
                          onChange={(e) => {
                            const next = e.target.value as RoleName
                            if (next) void handleRoleOverride(u.user_id, next)
                          }}
                          disabled={actionLoading === u.user_id}
                          style={{
                            height: '30px',
                            padding: '0 0.375rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--background)',
                            color: 'var(--foreground)',
                            fontSize: '0.8125rem',
                            fontFamily: 'inherit',
                          }}
                        >
                          <option value="">Override…</option>
                          <option value="student">Student</option>
                          <option value="professor">Professor</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: System Analytics & Reports */}
        {activeTab === 'reports' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem' }}>
              Aggregated System Analytics
            </h2>

            {reports ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Students</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.byRole.student}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Professors</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.byRole.professor}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Administrators</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.byRole.admin}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Pending Verifications</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: reports.pendingApplicants > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
                      {reports.pendingApplicants}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Active Documents</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.activeDocuments}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Soft-Deleted Documents</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.softDeletedDocuments}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Formatting Action Events</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.totalFormattingActions}</p>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>AI Suggestion Feedback</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                      {reports.feedback.accepted}
                      <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>
                        {' '}/ {reports.feedback.total} accepted
                      </span>
                    </p>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                    Acceptance by Feedback Channel (RQ4)
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                          <th style={{ padding: '0.625rem' }}>Channel</th>
                          <th style={{ padding: '0.625rem' }}>Total</th>
                          <th style={{ padding: '0.625rem' }}>Accepted</th>
                          <th style={{ padding: '0.625rem' }}>Rejected</th>
                          <th style={{ padding: '0.625rem' }}>Acceptance Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(reports.feedback.byType).map(([type, stats]) => (
                          <tr key={type} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.625rem', fontWeight: 500 }}>{type}</td>
                            <td style={{ padding: '0.625rem' }}>{stats.total}</td>
                            <td style={{ padding: '0.625rem' }}>{stats.accepted}</td>
                            <td style={{ padding: '0.625rem' }}>{stats.rejected}</td>
                            <td style={{ padding: '0.625rem', fontWeight: 600 }}>{stats.acceptanceRate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {Object.keys(reports.feedback.byType).length === 0 && (
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0.5rem 0 0' }}>
                        No AI feedback recorded yet.
                      </p>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  Generated at {new Date(reports.generatedAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <p style={{ color: 'var(--muted-foreground)' }}>No report data loaded.</p>
            )}
          </div>
        )}

        {/* Tab 4: Document Moderation */}
        {activeTab === 'moderation' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
              System Document Moderation
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1rem' }}>
              Global search across all users with author email, revision count, and last-updated audit info.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                setModerationActiveQuery(moderationQuery)
                void loadModeration()
              }}
              style={{ display: 'flex', gap: '0.5rem', maxWidth: '420px', marginBottom: '1rem' }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <Search style={{ width: '15px', height: '15px', position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  value={moderationQuery}
                  onChange={(e) => setModerationQuery(e.target.value)}
                  placeholder="Search documents by title…"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 0.75rem 0 2.25rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    fontSize: '0.8125rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading === 'search'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '36px',
                  padding: '0 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {actionLoading === 'search' ? 'Searching…' : 'Search'}
              </button>
            </form>

            {documents.length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)' }}>No documents found in system.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--background)',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title || 'Untitled Document'}
                        {doc.is_deleted && (
                          <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)', color: 'var(--error)', fontWeight: 600 }}>
                            SOFT-DELETED
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                        Author: {doc.email || doc.user_id} • Revisions: {doc.revision_count} • Updated {timeAgo(doc.updated_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDeleteDocument(doc.id)}
                      disabled={actionLoading === doc.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        height: '32px',
                        padding: '0 0.75rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)',
                        color: 'var(--error)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                      Purge Document
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Research Data & Empirical Exporter */}
        {activeTab === 'research' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Capstone Research Data &amp; Empirical Exporter
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1.5rem' }}>
              Export structured datasets for Chapter 4 empirical analysis covering RQ1 accuracy, RQ2 time savings, RQ4 UI channel acceptance, and RQ5 per-user learning curves.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.375rem' }}>Overall Acceptance Rate (RQ1)</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                  {reports?.feedback.acceptanceRate ?? '—'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                  {reports?.feedback.total ?? 0} prediction feedback records
                </p>
              </div>
              <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.375rem' }}>Formatting Behavior Events</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports?.totalFormattingActions ?? 0}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                  DuckDB aggregated events
                </p>
              </div>
              <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.375rem' }}>Registered Researchers</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports?.totalUsers ?? users.length}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                  Users contributing behavior data
                </p>
              </div>
            </div>

            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '2px dashed var(--border)', backgroundColor: 'var(--background)', textAlign: 'center' }}>
              <BookOpen style={{ width: '32px', height: '32px', color: 'var(--primary)', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.375rem' }}>
                Export Thesis Chapter 4 Empirical Dataset
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 1rem', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
                Downloads a timestamped CSV containing prediction accuracy by confidence tier, format distribution, UI-channel acceptance rates (RQ4), per-user learning curves (RQ5), and time-savings telemetry (RQ2).
              </p>
              <button
                type="button"
                onClick={() => { void handleExportEmpiricalData() }}
                disabled={exportLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  height: '38px',
                  padding: '0 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: exportLoading ? 'not-allowed' : 'pointer',
                  opacity: exportLoading ? 0.65 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <Download style={{ width: '16px', height: '16px' }} />
                {exportLoading ? 'Generating…' : 'Export Research Dataset'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Floating popup notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            maxWidth: '360px',
            padding: '0.75rem 1rem',
            borderRadius: '0.625rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
            backgroundColor: toast.type === 'success' ? 'var(--success)' : 'var(--error)',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          ) : (
            <AlertTriangle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          )}
          <span>{toast.text}</span>
        </motion.div>
      )}
    </div>
  )
}