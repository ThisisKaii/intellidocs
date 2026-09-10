import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type DocumentRecord, type FolderRecord } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { DriveTable, type DriveTableEditState, type BreadcrumbEntry } from '@/components/drive/DriveTable'
import DriveSidebar, { type FolderSelection } from '@/components/drive/DriveSidebar'
import { Search } from 'lucide-react'
import UserMenu from '@/components/UserMenu'
import DriveImportDialog from '@/components/DriveImportDialog'
import ImportFileModal, { type ImportProgress, ImportProgressToast } from '@/components/ImportFileModal'

/** One day in milliseconds — used for the "Recent" filter. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000

interface ConfirmDialogState {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}

/** Small centered confirmation modal used before any destructive action. */
function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialogState | null
  onClose: () => void
}): JSX.Element | null {
  if (!dialog) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-xl">
        <h2 className="text-base font-semibold text-foreground m-0 mb-2">{dialog.title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{dialog.description}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-foreground text-sm font-medium cursor-pointer hover:bg-secondary"
            style={{ fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            onClick={() => { dialog.onConfirm(); onClose() }}
            className="inline-flex items-center h-9 px-4 rounded-lg border-none bg-destructive text-white text-sm font-medium cursor-pointer hover:opacity-90"
            style={{ fontFamily: 'inherit' }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()

  /* ── Core data ─────────────────────────────────────── */
  const [allDocuments, setAllDocuments] = useState<DocumentRecord[]>([])
  const [sharedDocuments, setSharedDocuments] = useState<DocumentRecord[]>([])
  const [trashDocuments, setTrashDocuments] = useState<DocumentRecord[]>([])
  const [folderDocuments, setFolderDocuments] = useState<DocumentRecord[]>([])
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [currentFolderChildren, setCurrentFolderChildren] = useState<FolderRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')

  /* ── UI state ──────────────────────────────────────── */
  const [query, setQuery] = useState<string>('')
  const [editing, setEditing] = useState<DriveTableEditState | null>(null)
  const [selection, setSelection] = useState<FolderSelection>({ type: 'all' })
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [driveOpen, setDriveOpen] = useState<boolean>(false)
  const [importFileOpen, setImportFileOpen] = useState<boolean>(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  /* ── Load all documents once ───────────────────────── */
  useEffect(() => {
    async function loadInitialData(): Promise<void> {
      try {
        setLoading(true)
        const [docs, loadedFolders, trashList] = await Promise.all([
          api.documents.list(),
          api.folders.list(),
          api.documents.trash(),
        ])
        setAllDocuments(docs)
        setFolders(loadedFolders)
        setTrashDocuments(trashList)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drive data')
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  /* ── Load folder-specific documents when navigating into a folder ── */
  useEffect(() => {
    if (selection.type !== 'folder' || !selection.folderId) {
      setFolderDocuments([])
      setCurrentFolderChildren([])
      return
    }

    async function loadFolder(): Promise<void> {
      try {
        setLoading(true)
        const docs = await api.folders.documents(selection.folderId!)
        setFolderDocuments(docs)
        // We don't have a sub-folders endpoint yet, so clear children
        setCurrentFolderChildren([])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load folder')
      } finally {
        setLoading(false)
      }
    }
    loadFolder()
  }, [selection])

  /* ── Load shared + trash documents when those views open ── */
  useEffect(() => {
    if (selection.type === 'shared') {
      api.documents.shared().then(setSharedDocuments).catch(() => {})
    }
    if (selection.type === 'trash') {
      api.documents.trash().then(setTrashDocuments).catch(() => {})
    }
  }, [selection.type])

  /* ── Derived: which documents to show ──────────────── */
  const visibleDocuments = useMemo(() => {
    let docs: DocumentRecord[]

    switch (selection.type) {
      case 'folder':
        docs = folderDocuments
        break
      case 'recent': {
        const cutoff = Date.now() - RECENT_MS
        docs = allDocuments.filter((d) => new Date(d.updated_at).getTime() > cutoff)
        break
      }
      case 'shared':
        docs = sharedDocuments
        break
      case 'trash':
        docs = trashDocuments
        break
      default:
        docs = allDocuments
    }

    const sorted = [...docs].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((d) => d.title.toLowerCase().includes(q))
  }, [allDocuments, folderDocuments, sharedDocuments, trashDocuments, selection, query])

  /** Folders to display in the main content area (top-level or sub-folders). */
  const visibleFolders = useMemo((): FolderRecord[] => {
    if (selection.type === 'folder') return currentFolderChildren
    if (selection.type === 'all') {
      const q = query.trim().toLowerCase()
      if (!q) return folders
      return folders.filter((f) => f.name.toLowerCase().includes(q))
    }
    return []
  }, [selection, folders, currentFolderChildren, query])

  /* ── Actions ───────────────────────────────────────── */

  async function handleCreateDocument(): Promise<void> {
    try {
      setError('')
      const doc = await api.documents.create('Untitled document')
      if (selection.type === 'folder' && selection.folderId) {
        try {
          await api.folders.addDocument(selection.folderId, doc.id)
        } catch { /* best-effort */ }
      }
      navigate(`/document/${doc.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    }
  }

  function handleCreateFolder(): void {
    // Trigger the sidebar inline create — we simply create via API and refresh
    const name = prompt('Folder name:')
    if (!name?.trim()) return
    api.folders.create(name.trim())
      .then((created) => setFolders((prev) => [...prev, created]))
      .catch(() => setError('Failed to create folder'))
  }

  async function handleImportDoc(title: string, html: string): Promise<void> {
    try {
      setError('')
      const doc = await api.documents.create(title)
      await api.documents.update(doc.id, { content: html })
      if (selection.type === 'folder' && selection.folderId) {
        try {
          await api.folders.addDocument(selection.folderId, doc.id)
        } catch { /* best-effort */ }
      }
      navigate(`/document/${doc.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import document')
    }
  }

  /** Sidebar navigation. */
  function handleSelectView(sel: FolderSelection): void {
    setSelection(sel)
    setSelectedIds(new Set())
    setEditing(null)
    if (sel.type === 'folder' && sel.folderId && sel.folderName) {
      setBreadcrumbs([{ id: sel.folderId, name: sel.folderName }])
    } else {
      setBreadcrumbs([])
    }
  }

  /** Navigate into a folder from the main content area. */
  function handleOpenFolder(folder: FolderRecord): void {
    const newSel: FolderSelection = {
      type: 'folder',
      folderId: folder.folder_id,
      folderName: folder.name,
    }
    setSelection(newSel)
    setSelectedIds(new Set())
    setEditing(null)
    setBreadcrumbs((prev) => [...prev, { id: folder.folder_id, name: folder.name }])
  }

  /** Breadcrumb navigation — click a crumb to go back. */
  function handleBreadcrumbNavigate(crumb: BreadcrumbEntry | null): void {
    if (!crumb) {
      setSelection({ type: 'all' })
      setBreadcrumbs([])
      setSelectedIds(new Set())
      return
    }
    const idx = breadcrumbs.findIndex((b) => b.id === crumb.id)
    if (idx < 0) return
    const newCrumbs = breadcrumbs.slice(0, idx + 1)
    setBreadcrumbs(newCrumbs)
    setSelection({ type: 'folder', folderId: crumb.id, folderName: crumb.name })
    setSelectedIds(new Set())
  }

  /* ── Editing ───────────────────────────────────────── */

  function handleStartEdit(id: string, title: string, kind: 'file' | 'folder'): void {
    setEditing({ id, title, kind })
  }

  function handleCancelEdit(): void {
    setEditing(null)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editing) return
    try {
      if (editing.kind === 'file') {
        await api.documents.update(editing.id, { title: editing.title })
        setAllDocuments((docs) =>
          docs.map((d) => (d.id === editing.id ? { ...d, title: editing.title } : d))
        )
        setFolderDocuments((docs) =>
          docs.map((d) => (d.id === editing.id ? { ...d, title: editing.title } : d))
        )
      } else {
        await api.folders.rename(editing.id, editing.title)
        setFolders((prev) =>
          prev.map((f) => (f.folder_id === editing.id ? { ...f, name: editing.title } : f))
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename')
    } finally {
      setEditing(null)
    }
  }

  function handleTitleChange(nextTitle: string): void {
    if (editing) setEditing({ ...editing, title: nextTitle })
  }

  /* ── Delete ────────────────────────────────────────── */

  /** Permanently delete a doc that is already in the trash. */
  async function deleteFilePermanently(id: string): Promise<void> {
    try {
      await api.documents.deletePermanent(id)
      setTrashDocuments((docs) => docs.filter((d) => d.id !== id))
      setAllDocuments((docs) => docs.filter((d) => d.id !== id))
      setFolderDocuments((docs) => docs.filter((d) => d.id !== id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  /** Soft-delete (trash) a file or hard-delete a folder. */
  async function deleteFileSoft(id: string, kind: 'file' | 'folder'): Promise<void> {
    try {
      if (kind === 'file') {
        await api.documents.trashDoc(id)
        setAllDocuments((docs) => docs.filter((d) => d.id !== id))
        setFolderDocuments((docs) => docs.filter((d) => d.id !== id))
      } else {
        await api.folders.delete(id)
        setFolders((prev) => prev.filter((f) => f.folder_id !== id))
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  /** Ask for confirmation before any delete (soft or permanent). */
  function handleDelete(id: string, kind: 'file' | 'folder'): void {
    if (kind === 'file' && selection.type === 'shared') {
      setError('You can only delete documents you own')
      return
    }
    if (kind === 'file' && selection.type === 'trash') {
      const doc = trashDocuments.find((d) => d.id === id)
      setConfirmDialog({
        title: 'Delete permanently?',
        description: `"${doc?.title ?? 'This document'}" will be permanently deleted and cannot be recovered.`,
        confirmLabel: 'Delete forever',
        onConfirm: () => void deleteFilePermanently(id),
      })
      return
    }
    if (kind === 'file') {
      const doc = allDocuments.find((d) => d.id === id)
      setConfirmDialog({
        title: 'Move to trash?',
        description: `"${doc?.title ?? 'This document'}" will be moved to trash. You can restore it later.`,
        confirmLabel: 'Move to trash',
        onConfirm: () => void deleteFileSoft(id, kind),
      })
      return
    }
    const folder = folders.find((f) => f.folder_id === id)
    setConfirmDialog({
      title: 'Delete folder?',
      description: `Folder "${folder?.name ?? 'this folder'}" will be deleted. Documents inside it are not removed.`,
      confirmLabel: 'Delete folder',
      onConfirm: () => void deleteFileSoft(id, kind),
    })
  }

  /** Restore trashed documents back into the active list. */
  async function handleRestore(ids: string[]): Promise<void> {
    try {
      for (const id of ids) {
        await api.documents.restore(id)
        const restored = trashDocuments.find((d) => d.id === id)
        if (restored) setAllDocuments((prev) => [restored, ...prev])
      }
      setTrashDocuments((docs) => docs.filter((d) => !ids.includes(d.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore documents')
    }
  }

  /** Permanently delete every document currently in the trash. */
  function handleEmptyTrash(): void {
    const count = trashDocuments.length
    setConfirmDialog({
      title: 'Empty trash?',
      description: `${count} item${count === 1 ? '' : 's'} will be permanently deleted and cannot be recovered.`,
      confirmLabel: 'Empty trash',
      onConfirm: () => void confirmEmptyTrash(),
    })
  }

  async function confirmEmptyTrash(): Promise<void> {
    try {
      for (const doc of trashDocuments) {
        await api.documents.deletePermanent(doc.id)
      }
      setTrashDocuments([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to empty trash')
    }
  }

  /* ── Selection ─────────────────────────────────────── */

  const handleSelect = useCallback((id: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else if (event.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
    } else {
      setSelectedIds(new Set([id]))
    }
  }, [])

  function handleClearSelection(): void {
    setSelectedIds(new Set())
  }

  /* ── Drag and Drop ─────────────────────────────────── */

  function handleDragStart(e: React.DragEvent, id: string): void {
    e.dataTransfer.setData('text/document-id', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleMoveToFolder(docId: string, folderId: string): Promise<void> {
    try {
      await api.folders.addDocument(folderId, docId)
      // Remove from the current visible list if we're at root
      if (selection.type === 'all') {
        // Document is still in allDocuments but now inside a folder
        // Optionally we could remove it from root view — depends on desired behavior
      }
    } catch {
      setError('Failed to move document')
    }
  }

  /* ── Page title ────────────────────────────────────── */
  const pageTitle = useMemo((): string => {
    switch (selection.type) {
      case 'folder':
        return selection.folderName ?? 'Folder'
      case 'recent':
        return 'Recent'
      case 'shared':
        return 'Shared with me'
      case 'trash':
        return 'Trash'
      default:
        return 'My Documents'
    }
  }, [selection])

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Sidebar ──────────────────────────────────── */}
      <DriveSidebar
        selection={selection}
        onCreate={handleCreateDocument}
        onCreateFolder={handleCreateFolder}
        onSelectView={handleSelectView}
        onImportFromFile={() => setImportFileOpen(true)}
        onImportFromDrive={() => setDriveOpen(true)}
        documentCount={allDocuments.length}
        recentCount={allDocuments.filter((d) => new Date(d.updated_at).getTime() > Date.now() - RECENT_MS).length}
        trashCount={trashDocuments.length}
        folders={folders}
      />

      {/* ── Main ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 bg-background h-screen overflow-hidden px-4 pb-4">
        {/* ── Top Header ────────────────────────────── */}
        <header className="w-full flex-shrink-0 pt-3 pb-3">
          <div className="flex items-center justify-between h-14">
            {/* Search */}
            <div className="flex-1 max-w-2xl relative ml-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" strokeWidth={2} />
              <input
                type="text"
                placeholder="Search in Drive"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-full bg-muted hover:bg-muted/70 text-foreground text-[1rem] outline-none transition-colors focus:bg-card focus:shadow-md dark:focus:bg-card"
                style={{ fontFamily: 'inherit', border: 'none' }}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  title="Admin Dashboard"
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold border-none cursor-pointer transition-opacity hover:opacity-90"
                >
                  Admin Dashboard
                </button>
              )}

              <UserMenu />
            </div>
          </div>
        </header>

        {/* Pending Professor Notification Banner */}
        {user?.role === 'professor' && user?.verificationStatus === 'pending' && (
          <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center justify-between">
            <span>
              <strong>Professor Application Pending:</strong> Your request to register as a Professor is under review by an Administrator. Document review and grading features will be unlocked once approved.
            </span>
          </div>
        )}

        {/* ── Content Wrapper ───────────────────────── */}
        <main className="flex-1 bg-card rounded-2xl overflow-y-auto px-6 py-6" style={{ boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
          {/* Section header */}
          <div className="mb-4">
            <h1 className="text-2xl font-normal text-foreground m-0">{pageTitle}</h1>
            {selection.type === 'trash' && (
              <p className="text-sm text-muted-foreground mt-1">
                Items in trash are permanently deleted after you confirm. Restore anything you still need.
              </p>
            )}
          </div>

          {/* Trash actions */}
          {selection.type === 'trash' && trashDocuments.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleEmptyTrash}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-destructive/25 text-destructive text-xs font-semibold cursor-pointer hover:bg-destructive/5"
              >
                Empty trash
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => {
                    void handleRestore([...selectedIds])
                    setSelectedIds(new Set())
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-foreground text-xs font-semibold cursor-pointer hover:bg-secondary"
                >
                  Restore selected
                </button>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3.5 py-2.5 mb-6 text-sm text-destructive">
              {error}
            </div>
          )}

          <DriveTable
            documents={visibleDocuments}
            folders={visibleFolders}
            loading={loading}
            breadcrumbs={breadcrumbs}
            editing={editing}
            selectedIds={selectedIds}
            onBreadcrumbNavigate={handleBreadcrumbNavigate}
            onCreate={handleCreateDocument}
            onCreateFolder={handleCreateFolder}
            onOpenFolder={handleOpenFolder}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onRestore={(docId) => void handleRestore([docId])}
            readOnlyView={selection.type === 'trash'}
            onTitleChange={handleTitleChange}
            onSelect={handleSelect}
            onClearSelection={handleClearSelection}
            onMoveToFolder={handleMoveToFolder}
            onDragStart={handleDragStart}
          />
        </main>
      </div>

      <DriveImportDialog
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        onImport={handleImportDoc}
      />

      {importFileOpen && (
        <ImportFileModal
          onClose={() => setImportFileOpen(false)}
          onProgress={setImportProgress}
          onImported={() => {
            // Refresh document list after successful import
            api.documents.list().then(setAllDocuments).catch(() => {})
          }}
        />
      )}

      {/* Google-Drive-style import progress toast (bottom right) */}
      {importProgress && (
        <ImportProgressToast progress={importProgress} onDone={() => setImportProgress(null)} />
      )}

      {/* Destructive-action confirmation */}
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}