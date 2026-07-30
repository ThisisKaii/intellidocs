import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
} from 'lucide-react'

export default function AdminDashboard(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'professors' | 'users' | 'reports' | 'moderation'>('professors')
  const [pendingProfessors, setPendingProfessors] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [reports, setReports] = useState<any | null>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setMessage(null)
    try {
      const [pendingList, allUsers, sysReports, allDocs] = await Promise.all([
        api.admin.getPendingProfessors().catch(() => []),
        api.admin.getAllUsers().catch(() => []),
        api.admin.getSystemReports().catch(() => null),
        api.documents.list().catch(() => []),
      ])
      setPendingProfessors(pendingList)
      setUsers(allUsers)
      setReports(sysReports)
      setDocuments(allDocs)
    } catch (err) {
      console.error('Failed to load admin dashboard data', err)
      setMessage({ type: 'error', text: 'Failed to load administrative data' })
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyProfessor(userId: string, status: 'approved' | 'rejected') {
    setActionLoading(userId)
    setMessage(null)
    try {
      await api.admin.verifyProfessor(userId, status)
      setMessage({
        type: 'success',
        text: `Professor application ${status === 'approved' ? 'approved' : 'rejected'} successfully.`,
      })
      await loadData()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Verification action failed',
      })
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
      setMessage({ type: 'success', text: 'Document deleted successfully by Admin moderator.' })
      await loadData()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete document' })
    } finally {
      setActionLoading(null)
    }
  }

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
              Manage professor verifications, system users, platform reports, and document moderation.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
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

        {/* Action alert message */}
        {message && (
          <div
            style={{
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              backgroundColor: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: message.type === 'success' ? '#15803d' : '#b91c1c',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {message.text}
          </div>
        )}

        {/* Quick stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Pending Professors</span>
              <Clock style={{ width: '16px', height: '16px', color: '#eab308' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: pendingProfessors.length > 0 ? '#eab308' : 'var(--foreground)' }}>
              {pendingProfessors.length}
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
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Total Documents</span>
              <FileText style={{ width: '16px', height: '16px' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{reports?.totalDocuments ?? documents.length}</div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Formatting Actions Logged</span>
              <BarChart3 style={{ width: '16px', height: '16px' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{reports?.totalFormattingActions ?? 0}</div>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('professors')}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === 'professors' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'professors' ? 'var(--foreground)' : 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <UserCheck style={{ width: '16px', height: '16px' }} />
            Professor Queue ({pendingProfessors.length})
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
        </div>

        {/* Tab 1: Professor Verification Queue */}
        {activeTab === 'professors' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem' }}>
              Pending Professor Verification Requests
            </h2>

            {pendingProfessors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted-foreground)' }}>
                <CheckCircle2 style={{ width: '36px', height: '36px', color: '#16a34a', margin: '0 auto 0.75rem' }} />
                <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 500 }}>No pending professor applications</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
                  All professor registration requests have been reviewed.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pendingProfessors.map((applicant) => (
                  <div
                    key={applicant.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--background)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                          {applicant.display_name || applicant.user_id}
                        </span>
                        <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 600 }}>
                          PENDING VERIFICATION
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                        Applied on {new Date(applicant.applied_at).toLocaleDateString()} • User ID: {applicant.user_id}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleVerifyProfessor(applicant.user_id, 'approved')}
                        disabled={actionLoading === applicant.user_id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          height: '32px',
                          padding: '0 0.875rem',
                          borderRadius: '0.375rem',
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#fff',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <CheckCircle2 style={{ width: '14px', height: '14px' }} />
                        Approve
                      </button>

                      <button
                        type="button"
                        onClick={() => handleVerifyProfessor(applicant.user_id, 'rejected')}
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
                          color: '#dc2626',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <XCircle style={{ width: '14px', height: '14px' }} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: User Management */}
        {activeTab === 'users' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem' }}>
              System Registered Users
            </h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                    <th style={{ padding: '0.75rem' }}>User ID / Profile</th>
                    <th style={{ padding: '0.75rem' }}>Role</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem' }}>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                        {u.display_name || u.user_id}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {u.roles?.role_name || `Role ${u.role_id}`}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            backgroundColor:
                              u.verification_status === 'approved'
                                ? 'rgba(34,197,94,0.12)'
                                : u.verification_status === 'pending'
                                ? 'rgba(234,179,8,0.12)'
                                : 'rgba(239,68,68,0.12)',
                            color:
                              u.verification_status === 'approved'
                                ? '#16a34a'
                                : u.verification_status === 'pending'
                                ? '#ca8a04'
                                : '#dc2626',
                          }}
                        >
                          {u.verification_status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
                        {new Date(u.created_at).toLocaleDateString()}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Platform Users</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.totalUsers}</p>
                </div>
                <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Total Manuscripts & Documents</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.totalDocuments}</p>
                </div>
                <div style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>Total Behavior Actions Tracked</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{reports.totalFormattingActions}</p>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--muted-foreground)' }}>No report data loaded.</p>
            )}
          </div>
        )}

        {/* Tab 4: Document Moderation */}
        {activeTab === 'moderation' && (
          <div style={{ backgroundColor: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem' }}>
              System Document Moderation
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {documents.length === 0 ? (
                <p style={{ color: 'var(--muted-foreground)' }}>No documents found in system.</p>
              ) : (
                documents.map((doc) => (
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
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>
                        {doc.title || 'Untitled Document'}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                        Owner ID: {doc.user_id} • Updated {new Date(doc.updated_at).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.id)}
                      disabled={actionLoading === doc.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        height: '32px',
                        padding: '0 0.75rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        color: '#dc2626',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                      Delete Document
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
