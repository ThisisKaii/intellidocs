import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Check,
  ChevronRight,
  Eye,
  FileText,
  FolderIcon,
  Home,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentRecord, FolderRecord } from '@/services/api'

/* ─── Shared types ────────────────────────────────────────────── */

export interface DriveTableEditState {
  id: string
  title: string
  kind: 'file' | 'folder'
}

export interface BreadcrumbEntry {
  id: string
  name: string
}

interface DriveItem {
  id: string
  kind: 'file' | 'folder'
  title: string
  updatedAt: string
}

interface DriveTableProps {
  documents: DocumentRecord[]
  folders: FolderRecord[]
  loading: boolean
  breadcrumbs: BreadcrumbEntry[]
  editing: DriveTableEditState | null
  selectedIds: Set<string>
  onBreadcrumbNavigate: (crumb: BreadcrumbEntry | null) => void
  onCreate: () => void
  onCreateFolder: () => void
  onOpenFolder: (folder: FolderRecord) => void
  onStartEdit: (id: string, title: string, kind: 'file' | 'folder') => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: (id: string, kind: 'file' | 'folder') => void
  onRestore: (id: string) => void
  readOnlyView: boolean
  onTitleChange: (nextTitle: string) => void
  onSelect: (id: string, event: React.MouseEvent) => void
  onClearSelection: () => void
  onMoveToFolder: (docId: string, folderId: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

/* ─── Context Menu Overlay ────────────────────────────────────── */

interface ContextMenuState {
  x: number
  y: number
  item: DriveItem
}

function ContextMenuOverlay({
  ctx,
  onClose,
  onRename,
  onDelete,
  onRestore,
  readOnlyView,
}: {
  ctx: ContextMenuState
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onRestore: () => void
  readOnlyView: boolean
}): JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-background py-1.5 px-1"
        style={{
          top: ctx.y,
          left: ctx.x,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {readOnlyView ? (
          <>
            <button
              onClick={() => { onRestore(); onClose() }}
              className="flex items-center gap-3 w-full px-3 py-2 text-[0.8125rem] font-medium text-foreground bg-transparent border-none cursor-pointer rounded-lg hover:bg-secondary transition-colors text-left"
              style={{ fontFamily: 'inherit' }}
            >
              <RotateCcw className="size-3.5 text-muted-foreground" />
              Restore
            </button>
            <button
              onClick={() => { onDelete(); onClose() }}
              className="flex items-center gap-3 w-full px-3 py-2 text-[0.8125rem] font-medium text-destructive bg-transparent border-none cursor-pointer rounded-lg hover:bg-destructive/8 transition-colors text-left"
              style={{ fontFamily: 'inherit' }}
            >
              <Trash2 className="size-3.5" />
              Delete permanently
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { onRename(); onClose() }}
              className="flex items-center gap-3 w-full px-3 py-2 text-[0.8125rem] font-medium text-foreground bg-transparent border-none cursor-pointer rounded-lg hover:bg-secondary transition-colors text-left"
              style={{ fontFamily: 'inherit' }}
            >
              <Pencil className="size-3.5 text-muted-foreground" />
              Rename
            </button>
            <button
              onClick={() => { onDelete(); onClose() }}
              className="flex items-center gap-3 w-full px-3 py-2 text-[0.8125rem] font-medium text-destructive bg-transparent border-none cursor-pointer rounded-lg hover:bg-destructive/8 transition-colors text-left"
              style={{ fontFamily: 'inherit' }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </>
        )}
      </div>
    </>
  )
}

/* ─── Skeletons ───────────────────────────────────────────────── */

function ListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 mt-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 rounded-lg bg-secondary/50 animate-pulse" />
      ))}
    </div>
  )
}

/* ─── Main Component ──────────────────────────────────────────── */

export function DriveTable({
  documents,
  folders,
  loading,
  breadcrumbs,
  editing,
  selectedIds,
  onBreadcrumbNavigate,
  onCreate,
  onCreateFolder,
  onOpenFolder,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRestore,
  readOnlyView,
  onTitleChange,
  onSelect,
  onClearSelection,
  onMoveToFolder,
  onDragStart,
}: DriveTableProps): JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const items: DriveItem[] = documents.map((d): DriveItem => ({
    id: d.id,
    kind: 'file',
    title: d.title,
    updatedAt: d.updated_at,
  }))

  const handleContextMenu = useCallback((e: React.MouseEvent, item: DriveItem) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, item })
  }, [])

  const handleDoubleClick = useCallback((item: DriveItem) => {
    if (item.kind === 'file') {
      navigate(readOnlyView ? `/document/${item.id}?readonly=1` : `/document/${item.id}`)
    } else {
      const folder = folders.find((f) => f.folder_id === item.id)
      if (folder) onOpenFolder(folder)
    }
  }, [navigate, folders, onOpenFolder, readOnlyView])

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset.driveBackground === 'true') {
      onClearSelection()
    }
  }, [onClearSelection])

  const isEmpty = items.length === 0 && folders.length === 0 && !loading

  return (
    <div ref={containerRef} className="flex flex-col gap-6 min-h-0 pb-12" onClick={handleBackgroundClick} data-drive-background="true">

      {/* ── Toolbar ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm min-w-0">
          <button
            type="button"
            onClick={() => onBreadcrumbNavigate(null)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer px-2 py-1 rounded-md hover:bg-secondary"
            style={{ fontFamily: 'inherit' }}
          >
            <Home className="size-4" />
            <span className="text-sm font-medium">My Documents</span>
          </button>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
              <button
                type="button"
                onClick={() => onBreadcrumbNavigate(crumb)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground truncate bg-transparent border-none cursor-pointer px-2 py-1 rounded-md hover:bg-secondary transition-colors"
                style={{ fontFamily: 'inherit', maxWidth: '180px' }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      </div>

      {/* ── Loading ─────────────────────────────────── */}
      {loading && <ListSkeleton />}

      {/* ── Empty state ─────────────────────────────── */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 px-8 text-center bg-secondary/30 mt-4">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary mb-5"
            style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
          >
            <FileText className="size-7 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1.5">No items here</p>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs">Create a document or folder to get started</p>
          <div className="flex gap-3">
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium border-none cursor-pointer transition-opacity hover:opacity-90"
              style={{ fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
            >
              <Plus className="size-4" /> New document
            </button>
            <button
              onClick={onCreateFolder}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-card text-foreground text-sm font-medium border border-border cursor-pointer hover:bg-secondary transition-colors"
              style={{ fontFamily: 'inherit' }}
            >
              <FolderIcon className="size-4" /> New folder
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ── FOLDERS (Suggested Folders Grid) ────────── */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && folders.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground px-1">Suggested folders</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {folders.map((f) => {
              const item: DriveItem = {
                id: f.folder_id,
                kind: 'folder',
                title: f.name,
                updatedAt: f.updated_at,
              }
              const isEditing = editing?.id === f.folder_id
              const isSelected = selectedIds.has(f.folder_id)

              return (
                <div
                  key={f.folder_id}
                  draggable={!isEditing}
                  onDragStart={(e) => onDragStart(e, f.folder_id)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('bg-accent/80')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('bg-accent/80')
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('bg-accent/80')
                    const docId = e.dataTransfer.getData('text/document-id')
                    if (docId) onMoveToFolder(docId, f.folder_id)
                  }}
                  onClick={(e) => onSelect(f.folder_id, e)}
                  onDoubleClick={() => handleDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  className={`group relative flex items-center justify-between px-4 py-3.5 rounded-xl cursor-default transition-all duration-150 ${
                    isSelected
                      ? 'bg-primary/20'
                      : 'bg-secondary hover:bg-secondary/70'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <FolderIcon className="size-5 shrink-0 text-foreground" fill="currentColor" strokeWidth={1} />
                    {isEditing ? (
                      <input
                        value={editing.title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveEdit()
                          if (e.key === 'Escape') onCancelEdit()
                        }}
                        className="flex-1 min-w-0 h-7 rounded-md bg-background text-foreground text-sm px-2 outline-none border border-ring"
                        style={{ fontFamily: 'inherit' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="text-[0.9375rem] font-medium text-foreground truncate m-0"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                    )}
                  </div>

                  {!isEditing && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground/5 shrink-0 ml-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" style={{ minWidth: '160px' }}>
                        <DropdownMenuItem
                          onSelect={() => onStartEdit(item.id, item.title, item.kind)}
                          className="cursor-pointer gap-2 text-sm text-foreground"
                        >
                          <Pencil className="size-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onDelete(item.id, item.kind)}
                          className="cursor-pointer gap-2 text-sm text-destructive"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ── FILES (Suggested Files List) ────────────── */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <h2 className="text-sm font-medium text-foreground px-1 mb-2">Suggested files</h2>
          <div className="flex flex-col">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground border-b border-border">
              <span className="w-8" />
              <span className="flex-1">Name</span>
              <span className="w-32 text-left">Reason suggested</span>
              <span className="w-32 text-left">Owner</span>
              <span className="w-8" />
            </div>

            {items.map((item) => {
              const isEditing = editing?.id === item.id
              const isSelected = selectedIds.has(item.id)
              const displayName = user?.email?.split('@')[0] || 'Unknown'

              return (
                <div
                  key={item.id}
                  draggable={!isEditing}
                  onDragStart={(e) => onDragStart(e, item.id)}
                  onClick={(e) => onSelect(item.id, e)}
                  onDoubleClick={() => handleDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  className={`group flex items-center gap-4 px-4 py-3 cursor-default border-b border-border/40 transition-colors ${
                    isSelected
                      ? 'bg-primary/20'
                      : 'hover:bg-secondary/40'
                  }`}
                >
                  {/* Icon */}
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <FileText className="size-[22px] text-blue-500" strokeWidth={1.5} />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          value={editing.title}
                          onChange={(e) => onTitleChange(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveEdit()
                            if (e.key === 'Escape') onCancelEdit()
                          }}
                          className="flex-1 min-w-0 h-8 rounded-md bg-background text-foreground text-sm px-2 outline-none border border-ring"
                          style={{ fontFamily: 'inherit' }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); onSaveEdit() }}
                          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground border-none cursor-pointer"
                        >
                          <Check className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-foreground truncate block" title={item.title}>
                        {item.title}
                      </span>
                    )}
                  </div>

                  {/* Reason suggested (using Modified date) */}
                  <span className="w-32 text-left text-[0.8125rem] text-muted-foreground shrink-0 truncate">
                    You opened • {formatDate(item.updatedAt)}
                  </span>

                  {/* Owner (mocked to match Drive screenshot) */}
                  <div className="w-32 flex items-center gap-2 text-left text-[0.8125rem] text-muted-foreground shrink-0">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center overflow-hidden shrink-0">
                      <span className="text-[10px] font-bold text-primary-foreground">
                        {displayName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="truncate">{displayName}</span>
                  </div>

                  {/* Actions */}
                  <div className={`flex items-center justify-end gap-1 shrink-0 ${readOnlyView ? '' : 'w-8'}`}>
                    {!isEditing && readOnlyView ? (
                      <>
                        <button
                          title="Open (view only)"
                          onClick={(e) => { e.stopPropagation(); navigate(`/document/${item.id}?readonly=1`) }}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer transition-colors hover:bg-secondary"
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          title="Restore"
                          onClick={(e) => { e.stopPropagation(); onRestore(item.id) }}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-foreground border-none cursor-pointer transition-colors hover:bg-secondary"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                        <button
                          title="Delete permanently"
                          onClick={(e) => { e.stopPropagation(); onDelete(item.id, item.kind) }}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-destructive border-none cursor-pointer transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    ) : (
                      !isEditing && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" style={{ minWidth: '160px' }}>
                            <DropdownMenuItem
                              onSelect={() => onStartEdit(item.id, item.title, item.kind)}
                              className="cursor-pointer gap-2 text-sm text-foreground"
                            >
                              <Pencil className="size-3.5" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => onDelete(item.id, item.kind)}
                              className="cursor-pointer gap-2 text-sm text-destructive"
                            >
                              <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Context Menu ────────────────────────────── */}
      {ctxMenu && (
        <ContextMenuOverlay
          ctx={ctxMenu}
          onClose={() => setCtxMenu(null)}
          readOnlyView={readOnlyView}
          onRename={() => onStartEdit(ctxMenu.item.id, ctxMenu.item.title, ctxMenu.item.kind)}
          onRestore={() => onRestore(ctxMenu.item.id)}
          onDelete={() => onDelete(ctxMenu.item.id, ctxMenu.item.kind)}
        />
      )}
    </div>
  )
}