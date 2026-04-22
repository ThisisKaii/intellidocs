import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type DocumentRecord } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { DriveTable, type DriveDocumentRow, type DriveTableEditState } from '@/components/drive/DriveTable'
import DriveSidebar from '@/components/drive/DriveSidebar'
import { LogOut } from 'lucide-react'

export default function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [query, setQuery] = useState<string>('')
  const [editing, setEditing] = useState<DriveTableEditState | null>(null)

  useEffect(() => {
    async function loadDocuments(): Promise<void> {
      try {
        setLoading(true)
        setError('')
        const data = await api.documents.list()
        setDocuments(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      } finally {
        setLoading(false)
      }
    }
    loadDocuments()
  }, [])

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...documents].sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    if (!q) return sorted
    return sorted.filter((doc) => doc.title.toLowerCase().includes(q))
  }, [documents, query])

  async function handleCreateDocument(): Promise<void> {
    try {
      setError('')
      const doc = await api.documents.create('Untitled document')
      navigate(`/document/${doc.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    }
  }

  function handleLogout(): void {
    logout()
    navigate('/login')
  }

  function handleStartEdit(doc: DriveDocumentRow): void {
    setEditing({ id: doc.id, title: doc.title })
  }

  function handleCancelEdit(): void {
    setEditing(null)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editing) return
    try {
      await api.documents.update(editing.id, { title: editing.title })
      setDocuments((docs) =>
        docs.map((d) => (d.id === editing.id ? { ...d, title: editing.title } : d))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename document')
    } finally {
      setEditing(null)
    }
  }

  function handleTitleChange(nextTitle: string): void {
    if (editing) setEditing({ ...editing, title: nextTitle })
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await api.documents.delete(id)
      setDocuments((docs) => docs.filter((d) => d.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      {/* ── Sidebar ────────────────────────────────────────── */}
      <DriveSidebar activeId="drive" onCreate={handleCreateDocument} />

      {/* ── Main Content Area ──────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        
        {/* ── Top Header (Search & Actions) ─────────────── */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            width: '100%',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '64px',
              padding: '0 2rem',
              gap: '1rem',
            }}
          >
            {/* Search */}
            <div style={{ flex: 1, maxWidth: '600px' }}>
              <input
                type="text"
                placeholder="Search in Drive…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '40px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--foreground)',
                  fontSize: '0.9375rem',
                  padding: '0 1.25rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'background-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--background)'
                  e.currentTarget.style.boxShadow = '0px 0px 0px 1px var(--border-shadow), 0 0 0 3px rgba(59,130,246,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--secondary)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={handleLogout}
                title="Sign out"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  transition: 'color 150ms, background-color 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--secondary)'
                  e.currentTarget.style.color = 'var(--foreground)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                }}
              >
                <LogOut style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        </header>

        {/* ── Document Grid ───────────────────────────────── */}
        <main
          style={{
            flex: 1,
            width: '100%',
            padding: '2rem',
            boxSizing: 'border-box',
          }}
        >
          {/* Section header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--foreground)',
                margin: '0 0 0.25rem 0',
              }}
            >
              My Documents
            </h1>
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(255,91,79,0.08)',
                border: '1px solid rgba(255,91,79,0.25)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                color: 'var(--destructive)',
              }}
            >
              {error}
            </div>
          )}

          <DriveTable
            documents={filteredDocs}
            loading={loading}
            error=""
            editing={editing}
            onCreate={handleCreateDocument}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onTitleChange={handleTitleChange}
          />
        </main>
      </div>
    </div>
  )
}