import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type DocumentRecord } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { DriveHeader } from '@/components/drive/DriveHeader'
import DriveSidebar from '@/components/drive/DriveSidebar'
import {
  DriveTable,
  type DriveDocumentRow,
  type DriveTableEditState,
} from '@/components/drive/DriveTable'

type DocumentSummary = Pick<
  DocumentRecord,
  'id' | 'title' | 'updated_at' | 'created_at'
>

function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [documents, setDocuments] = useState<DocumentSummary[]>([])
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
        setDocuments(
          data.map((doc) => ({
            id: doc.id,
            title: doc.title,
            updated_at: doc.updated_at,
            created_at: doc.created_at,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      } finally {
        setLoading(false)
      }
    }

    loadDocuments()
  }, [])

  const filteredDocs: DriveDocumentRow[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...documents].sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime()
      const bTime = new Date(b.updated_at).getTime()
      return bTime - aTime
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
      setError('')
      await api.documents.update(editing.id, { title: editing.title })
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === editing.id ? { ...doc, title: editing.title } : doc
        )
      )
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename document')
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      setError('')
      await api.documents.delete(id)
      setDocuments((prev) => prev.filter((doc) => doc.id !== id))
      if (editing?.id === id) setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  function handleTitleChange(nextTitle: string): void {
    if (!editing) return
    setEditing({ ...editing, title: nextTitle })
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      <DriveHeader
        query={query}
        onQueryChange={setQuery}
        onCreate={handleCreateDocument}
        onLogout={handleLogout}
      />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <DriveSidebar activeId="home" onCreate={handleCreateDocument} />

        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">

          <DriveTable
            documents={filteredDocs}
            loading={loading}
            error={error}
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

export default HomePage