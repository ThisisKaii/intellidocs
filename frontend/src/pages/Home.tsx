import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type DocumentRecord } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import DriveSidebar from '@/components/drive/DriveSidebar'
import { DriveHeader } from '@/components/drive/DriveHeader'
import { DriveTable, type DriveDocumentRow, type DriveTableEditState } from '@/components/drive/DriveTable'
import { DriveSearchSection } from '@/components/drive/DriveSearchSection'
import { Folder } from 'lucide-react'

function SuggestedFolders(): JSX.Element {
  const folders = [
    { id: '1', name: 'Dissertation 2024' },
    { id: '2', name: 'Grant Proposals' },
    { id: '3', name: 'Literature Reviews' },
    { id: '4', name: 'Meeting Notes' },
  ]

  return (
    <div className="mb-10">
      <h2 className="text-sm font-medium text-foreground px-4 mb-4">
        Suggested folders
      </h2>
      <div className="flex flex-wrap gap-4 px-4">
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card pr-4 pl-3 py-2 transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <Folder className="size-4 text-muted-foreground fill-muted-foreground/20" />
            <span className="text-sm font-medium text-foreground">
              {folder.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

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
    if (editing) {
      setEditing({ ...editing, title: nextTitle })
    }
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
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <DriveSidebar activeId="home" onCreate={handleCreateDocument} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DriveHeader
          query={query}
          onQueryChange={setQuery}
          onCreate={handleCreateDocument}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto w-full max-w-[96rem] mx-auto p-4 sm:p-6 lg:p-8">
          <DriveSearchSection query={query} onQueryChange={setQuery} />
          
          <SuggestedFolders />

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