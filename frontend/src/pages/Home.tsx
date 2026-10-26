import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type DocumentRecord, type DriveFile, type FolderRecord, type FolderType, type StorageSummary, type UserPreset } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { useImports } from '@/context/ImportContext'
import { DriveTable, type DriveTableEditState, type BreadcrumbEntry } from '@/components/drive/DriveTable'
import DriveSidebar, { type FolderSelection } from '@/components/drive/DriveSidebar'
import { FileText, FolderIcon, GraduationCap, HardDrive, Menu, Plus, Search, Upload } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import UserMenu from '@/components/UserMenu'
import DriveImportDialog from '@/components/DriveImportDialog'
import FolderCreateModal from '@/components/drive/FolderCreateModal'
import JoinClassModal from '@/components/drive/JoinClassModal'
import DocumentCreateModal from '@/components/DocumentCreateModal'
import {
  buildBlueprintHtml,
  type DocumentBlueprint,
} from '@/components/editor/documentBlueprints'
import ImportFileModal from '@/components/ImportFileModal'
import ShareModal from '@/components/ShareModal'
import { supabase } from '@/lib/supabase'
import { useDriveCache } from '@/hooks/useDriveCache'
import { ACADEMIC_PRESETS } from '@/components/editor/academicPresets'
import { motion } from 'framer-motion'

/** One day in milliseconds — used for the "Recent" filter. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000

interface ConfirmDialogState {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  tone?: 'destructive' | 'primary'
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-overlay">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl animate-modal">
        <h2 className="text-base font-semibold text-foreground m-0 mb-2">{dialog.title}</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{dialog.description}</p>
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="btn-ghost h-9 px-4 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => { dialog.onConfirm(); onClose() }}
            className="btn-primary h-9 px-4 rounded-lg text-sm"
            style={{
              backgroundColor: dialog.tone === 'primary' ? 'var(--primary, hsl(221 83% 53%))' : 'var(--destructive, hsl(0 72% 51%))',
            }}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  const initialFolderId = searchParams.get('folder')
  const initialView = searchParams.get('view')

  /* ── Core data ─────────────────────────────────────── */
  const [allDocuments, setAllDocuments] = useState<DocumentRecord[]>([])
  const [sharedDocuments, setSharedDocuments] = useState<DocumentRecord[]>([])
  const [trashDocuments, setTrashDocuments] = useState<DocumentRecord[]>([])
  const [folderDocuments, setFolderDocuments] = useState<DocumentRecord[]>([])
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [joinClassOpen, setJoinClassOpen] = useState(false)
  const [currentFolderChildren, setCurrentFolderChildren] = useState<FolderRecord[]>([])
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')

  /* ── UI state ──────────────────────────────────────── */
  const [query, setQuery] = useState<string>('')
  const [editing, setEditing] = useState<DriveTableEditState | null>(null)
  const [selection, setSelection] = useState<FolderSelection>(() => {
    if (initialFolderId) {
      return { type: 'folder', folderId: initialFolderId, folderName: 'Folder' }
    }
    if (initialView === 'trash') return { type: 'trash' }
    if (initialView === 'shared') return { type: 'shared' }
    return { type: 'all' }
  })
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>(() => {
    if (initialFolderId) {
      return [{ id: initialFolderId, name: 'Folder' }]
    }
    return []
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [driveOpen, setDriveOpen] = useState<boolean>(false)
  const [importFileOpen, setImportFileOpen] = useState<boolean>(false)
  const [folderModalOpen, setFolderModalOpen] = useState<boolean>(false)
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false)
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false)
  const [createModalError, setCreateModalError] = useState<string>('')
  const [userPresets, setUserPresets] = useState<UserPreset[]>([])
  const [folderSubmitting, setFolderSubmitting] = useState<boolean>(false)
  const [folderModalError, setFolderModalError] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)
  const { importFiles, trackJob } = useImports()
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [shareDocId, setShareDocId] = useState<string | null>(null)

  /* ── Load all documents once ───────────────────────── */
  const driveCache = useDriveCache()

  useEffect(() => {
    if (driveCache.error) {
      setError(driveCache.error)
      setLoading(false)
      return
    }
    if (!driveCache.data) return
    setAllDocuments(driveCache.data.documents)
    setFolders(driveCache.data.folders)
    setTrashDocuments(driveCache.data.trash)
    setLoading(driveCache.isLoading && !driveCache.data)
  }, [driveCache.data, driveCache.isLoading, driveCache.error])

  /* ── Load the user's own storage usage for the sidebar card ── */
  useEffect(() => {
    let cancelled = false
    api.auth
      .storage()
      .then((summary) => { if (!cancelled) setStorageSummary(summary) })
      .catch(() => { /* Storage is non-critical; keep the card muted on failure. */ })
    return () => { cancelled = true }
  }, [])

  /* ── Sync folder name and breadcrumbs when folders load ── */
  useEffect(() => {
    if (selection.type === 'folder' && selection.folderId && folders.length > 0) {
      const match = folders.find((f) => f.folder_id === selection.folderId)
      if (match && match.name !== selection.folderName) {
        setSelection((prev) => ({ ...prev, folderName: match.name }))
        setBreadcrumbs([{ id: match.folder_id, name: match.name }])
      }
    }
  }, [folders, selection.type, selection.folderId, selection.folderName])

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

  /* ── User blueprint forks: offer them in the new-document modal ── */
  useEffect(() => {
    api.formatting
      .listUserPresets()
      .then(setUserPresets)
      .catch(() => {
        /* The user-presets table is not applied yet, or the fetch failed.
         * The modal simply shows the standard blueprints only. */
        setUserPresets([])
      })
  }, [])

  /* ── Supabase Realtime: refresh "Shared with me" instantly (plan point 14) ── */
  useEffect(() => {
    const channel = supabase
      .channel('home-shares')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_shares',
          filter: user?.email ? `shared_with_email=eq.${user.email}` : undefined,
        },
        () => {
          // Any change to shares — refresh the shared list so the collaborator
          // sees their new document immediately.
          api.documents.shared().then(setSharedDocuments).catch(() => {})
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.email])

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
    setCreateModalError('')
    setCreateModalOpen(true)
  }

  /**
   * Create the document described by the new-document modal. A blueprint seeds
   * the structural sections and binds its preset in the same insert, so the
   * editor opens already structured instead of as an empty page.
   */
  async function submitCreateDocument(input: {
    title: string
    blueprint: DocumentBlueprint
    presetKey: string | null
  }): Promise<void> {
    try {
      setError('')
      setCreateModalError('')
      setCreateSubmitting(true)
      const doc = await api.documents.create(input.title, {
        content: buildBlueprintHtml(input.blueprint),
        formatting_preset: input.presetKey ?? undefined,
      })
      // The preset's page size, orientation and margins apply from the first open.
      const preset = ACADEMIC_PRESETS.find((candidate) => candidate.key === input.presetKey)
      if (preset) {
        try {
          await api.documents.update(doc.id, {
            page_size: preset.pageSize,
            orientation: preset.orientation,
            margins: preset.margins,
          })
        } catch { /* the editor falls back to the default page setup */ }
      }
      setCreateModalOpen(false)
      if (selection.type === 'folder' && selection.folderId) {
        try {
          await api.folders.addDocument(selection.folderId, doc.id)
        } catch { /* best-effort */ }
      }
      navigate(`/document/${doc.id}`)
    } catch (err) {
      setCreateModalError(
        err instanceof Error ? err.message : 'Failed to create document'
      )
    } finally {
      setCreateSubmitting(false)
    }
  }

  /** Reload the folder list after joining a class so the new class and workspace show up. */
  function refreshFolders(): void {
    api.folders.list().then(setFolders).catch(() => {})
  }

  function handleCreateFolder(): void {
    setFolderModalError('')
    setFolderModalOpen(true)
  }

  /** Create the folder described by the modal, then refresh the sidebar list. */
  async function submitCreateFolder(input: {
    name: string
    folderType: FolderType
    classCode?: string
    academicTerm?: string
  }): Promise<void> {
    setFolderSubmitting(true)
    setFolderModalError('')
    try {
      const created = await api.folders.create(input.name, {
        folderType: input.folderType,
        classCode: input.classCode,
        academicTerm: input.academicTerm,
      })
      setFolders((prev) => [...prev, created])
      setFolderModalOpen(false)
    } catch (err) {
      setFolderModalError(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setFolderSubmitting(false)
    }
  }

  /** Create a document inside the current selection (folder aware). */
  async function createImportedDocument(displayTitle: string, html: string): Promise<void> {
    const doc = await api.documents.create(displayTitle, { unique_title: true })
    await api.documents.update(doc.id, { content: html })
    if (selection.type === 'folder' && selection.folderId) {
      try {
        await api.folders.addDocument(selection.folderId, doc.id)
      } catch { /* best-effort */ }
    }
    navigate(`/document/${doc.id}`)
  }

  /** Import converted content as a new document; the server numbers duplicate names "(1)", "(2)". */
  async function handleImportDoc(title: string, html: string): Promise<void> {
    try {
      setError('')
      await createImportedDocument(title, html)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import document')
    }
  }

  /**
   * Import a Google Drive file. Small files come back as HTML and open at once.
   * Files over 15MB come back as 202 with a job id: the server converts and
   * saves them in the background and the global import toast follows the job,
   * so the user can leave this page meanwhile.
   */
  async function handleDriveImport(file: DriveFile): Promise<void> {
    setError('')
    try {
      const res = await api.drive.exportFile(file.id)

      // A 202 body carries jobId and no html field at all, so discriminate on
      // the presence of html rather than on an optional jobId.
      if (!('html' in res)) {
        trackJob(res.jobId, file.name)
        return
      }

      await api.documents.list().then(setAllDocuments).catch(() => undefined)
      await handleImportDoc(res.title, res.html)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import "${file.name}".`)
    }
  }

  /** Sidebar navigation. */
  function handleSelectView(sel: FolderSelection): void {
    setSelection(sel)
    setSelectedIds(new Set())
    setEditing(null)
    if (sel.type === 'folder' && sel.folderId && sel.folderName) {
      setBreadcrumbs([{ id: sel.folderId, name: sel.folderName }])
      setSearchParams({ folder: sel.folderId })
    } else {
      setBreadcrumbs([])
      if (sel.type === 'trash') {
        setSearchParams({ view: 'trash' })
      } else if (sel.type === 'shared') {
        setSearchParams({ view: 'shared' })
      } else {
        setSearchParams({})
      }
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
    setSearchParams({ folder: folder.folder_id })
  }

  /** Breadcrumb navigation — click a crumb to go back. */
  function handleBreadcrumbNavigate(crumb: BreadcrumbEntry | null): void {
    if (!crumb) {
      setSelection({ type: 'all' })
      setBreadcrumbs([])
      setSelectedIds(new Set())
      setSearchParams({})
      return
    }
    const idx = breadcrumbs.findIndex((b) => b.id === crumb.id)
    if (idx < 0) return
    const newCrumbs = breadcrumbs.slice(0, idx + 1)
    setBreadcrumbs(newCrumbs)
    setSelection({ type: 'folder', folderId: crumb.id, folderName: crumb.name })
    setSelectedIds(new Set())
    setSearchParams({ folder: crumb.id })
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
        return 'My documents'
    }
  }, [selection])

  /* ── Global search shortcut ────────────────────────── */
  // Captured in the capture phase so the browser omnibar never opens; focus
  // and select whatever the search omnibar already holds.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        const searchInput = document.getElementById('drive-search-input') as HTMLInputElement | null
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  }, [])

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Sidebar ──────────────────────────────────── */}
      <DriveSidebar
        selection={selection}
        onCreate={handleCreateDocument}
        onCreateFolder={handleCreateFolder}
        onJoinClass={() => setJoinClassOpen(true)}
        onSelectView={handleSelectView}
        onImportFromFile={() => setImportFileOpen(true)}
        onImportFromDrive={() => setDriveOpen(true)}
        documentCount={allDocuments.length}
        recentCount={allDocuments.filter((d) => new Date(d.updated_at).getTime() > Date.now() - RECENT_MS).length}
        trashCount={trashDocuments.length}
        folders={folders}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        storage={storageSummary}
      />

      {/* Mobile drawer backdrop (below sidebar z-40, above content) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 bg-background h-screen overflow-hidden px-4 pb-4">
        {/* ── Top Header ────────────────────────────── */}
        <header className="w-full flex-shrink-0 pt-3 pb-3">
          <div className="relative flex items-center justify-between h-14 px-2">
            {/* Left: Hamburger (mobile only) */}
            <div className="flex items-center gap-2 z-10">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden flex items-center justify-center size-10 shrink-0 rounded-full bg-card text-foreground border border-border cursor-pointer hover:bg-secondary transition-colors"
                style={{ fontFamily: 'inherit' }}
              >
                <Menu className="size-5" />
              </button>
            </div>

            {/* Center: Search Omnibar (Centered across header) */}
            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-xl px-4 pointer-events-auto z-0">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" strokeWidth={2} />
                <input
                  id="drive-search-input"
                  type="text"
                  placeholder="Search documents, folders, class codes..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-11 pl-11 pr-20 rounded-2xl bg-card text-foreground placeholder:text-muted-foreground text-sm outline-none border border-border/70 transition-all hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                  style={{ fontFamily: 'inherit' }}
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-secondary rounded-md border border-border/60 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  Ctrl K
                </kbd>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3 shrink-0 ml-auto z-10">
              {user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  title="Admin Dashboard"
                  className="hidden md:inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold border-none cursor-pointer transition-opacity hover:opacity-90"
                >
                  Admin Dashboard
                </button>
              )}

              <UserMenu />
            </div>
          </div>
        </header>

        {/* Pending Professor Notification Banner */}
        {user?.verificationStatus === 'pending' && (user?.requestedRole === 'professor' || user?.role === 'professor') && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mx-4 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-medium flex items-center justify-between"
          >
            <span>
              <strong>Professor Application Pending:</strong> Your request to register as a Professor is under review by an Administrator. Document review and grading features will be unlocked once approved.
            </span>
          </motion.div>
        )}


        {/* ── Content Wrapper ───────────────────────── */}
        <motion.main className="flex-1 bg-card border border-border rounded-2xl overflow-y-auto px-6 py-6 shadow-sm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}>
          {/* Section header */}
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold normal-case tracking-tight text-foreground m-0">{pageTitle}</h1>
              <span className="text-xs font-medium text-muted-foreground bg-secondary rounded-full px-2.5 py-1 leading-none">
                {visibleDocuments.length} {visibleDocuments.length === 1 ? 'document' : 'documents'}
              </span>
            </div>
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
                    const ids = [...selectedIds]
                    setConfirmDialog({
                      title: `Restore ${ids.length} document${ids.length === 1 ? '' : 's'}?`,
                      description: ids.length === 1
                        ? 'The document will be moved back to your active documents.'
                        : 'The selected documents will be moved back to your active documents.',
                      confirmLabel: 'Restore',
                      onConfirm: () => void handleRestore(ids),
                    })
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
            onRestore={(docId) => {
              const doc = trashDocuments.find((d) => d.id === docId)
              setConfirmDialog({
                title: 'Restore document?',
                description: `"${doc?.title ?? 'This document'}" will be moved back to your active documents.`,
                confirmLabel: 'Restore',
                onConfirm: () => void handleRestore([docId]),
              })
            }}
            readOnlyView={selection.type === 'trash'}
            onTitleChange={handleTitleChange}
            onSelect={handleSelect}
            onClearSelection={handleClearSelection}
            onMoveToFolder={handleMoveToFolder}
            onDragStart={handleDragStart}
            onShare={(docId) => {
              // Only owners can share — shared view is read-only.
              if (selection.type === 'shared') {
                setError('You can only share documents you own')
                return
              }
              setShareDocId(docId)
            }}
            onFoldersChanged={() => {
              // Roster edits change the class folder's student/submission
              // counts, so pull the folder list again to refresh the badges.
              void driveCache.refresh()
            }}
          />
        </motion.main>
      </div>

      <DriveImportDialog
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        onImport={(file) => { void handleDriveImport(file) }}
        onUploadInstead={() => { setDriveOpen(false); setImportFileOpen(true) }}
      />

      {importFileOpen && (
        <ImportFileModal
          onClose={() => setImportFileOpen(false)}
          onImport={importFiles}
        />
      )}

      {joinClassOpen && (
        <JoinClassModal
          onClose={() => setJoinClassOpen(false)}
          onJoined={refreshFolders}
          onOpenClass={(classFolder) => handleSelectView({ type: 'folder', folderId: classFolder.folder_id })}
        />
      )}

      {/* New folder — personal workspace vs. student class folder */}
      {folderModalOpen && (
        <FolderCreateModal
          onClose={() => {
            setFolderModalOpen(false)
            setFolderModalError('')
          }}
          onSubmit={submitCreateFolder}
          submitting={folderSubmitting}
          error={folderModalError}
          userRole={user?.role}
        />
      )}

      {/* New document — blueprint picker (section 9) */}
      {createModalOpen && (
        <DocumentCreateModal
          onClose={() => {
            setCreateModalOpen(false)
            setCreateModalError('')
          }}
          onSubmit={submitCreateDocument}
          existingTitles={allDocuments.map((d) => d.title)}
          userPresets={userPresets}
          submitting={createSubmitting}
          error={createModalError}
        />
      )}

      {/* Destructive-action confirmation */}
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      {/* Share document modal (plan point 15) */}
      {shareDocId && (
        <ShareModal documentId={shareDocId} onClose={() => setShareDocId(null)} />
      )}

      {/* Mobile "+ New" FAB (below md) */}
      <div className="fixed bottom-6 right-5 z-40 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Create new"
              className="flex items-center justify-center size-14 rounded-full bg-[var(--accent-strong)] text-white border-none cursor-pointer shadow-lg shadow-primary/30 hover:bg-[var(--accent-hover)] active:scale-95 transition-all"
              style={{ fontFamily: 'inherit' }}
            >
              <Plus className="size-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" style={{ minWidth: '190px' }}>
            <DropdownMenuItem onClick={() => void handleCreateDocument()} className="gap-2 py-2.5 cursor-pointer">
              <FileText className="size-4" /> New document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCreateFolder} className="gap-2 py-2.5 cursor-pointer">
              <FolderIcon className="size-4 text-primary" /> New folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setJoinClassOpen(true)} className="gap-2 py-2.5 cursor-pointer">
              <GraduationCap className="size-4 text-primary" /> Join a class
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportFileOpen(true)} className="gap-2 py-2.5 cursor-pointer">
              <Upload className="size-4 text-primary" /> Import from file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDriveOpen(true)} className="gap-2 py-2.5 cursor-pointer">
              <HardDrive className="size-4 text-primary" /> Import from Drive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}