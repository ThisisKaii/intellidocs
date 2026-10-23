import { useCallback, useMemo, useRef, useState } from 'react'
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
  GraduationCap,
  FolderIcon,
  Home,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ClassRosterModal } from '@/components/drive/ClassRosterModal'
import { DocumentPreview, PreviewStyles, sanitizePreviewHtml } from '@/components/drive/DocumentPreview'
import type { PreviewPageSetup } from '@/components/drive/DocumentPreview'
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
  /** Sanitized Page 1 markup rendered on the card's paper sheet. */
  previewHtml: string
  /** Page setup so the thumbnail matches the real first page. */
  pageSetup: PreviewPageSetup
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
  onShare?: (id: string) => void
  /** Re-fetch folders so class badges (student/submission counts) stay accurate. */
  onFoldersChanged?: () => void
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
  onShare,
  readOnlyView,
}: {
  ctx: ContextMenuState
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onRestore: () => void
  onShare?: () => void
  readOnlyView: boolean
}): JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-background py-1.5 px-1 animate-popover"
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
            {ctx.item.kind === 'file' && onShare && (
              <button
                onClick={() => { onShare(); onClose() }}
                className="flex items-center gap-3 w-full px-3 py-2 text-[0.8125rem] font-medium text-foreground bg-transparent border-none cursor-pointer rounded-lg hover:bg-secondary transition-colors text-left"
                style={{ fontFamily: 'inherit' }}
              >
                <Share2 className="size-3.5 text-muted-foreground" />
                Share
              </button>
            )}
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
  onShare,
  onFoldersChanged,
}: DriveTableProps): JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [rosterFolder, setRosterFolder] = useState<FolderRecord | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const containerRef = useRef<HTMLDivElement>(null)

  const items: DriveItem[] = useMemo(
    () =>
      documents.map((d): DriveItem => ({
        id: d.id,
        kind: 'file',
        title: d.title,
        updatedAt: d.updated_at,
        previewHtml: sanitizePreviewHtml(d.preview_snippet ?? d.content ?? ''),
        pageSetup: {
          pageSize: d.page_size ?? null,
          orientation: d.orientation ?? null,
          margins: d.margins ?? null,
          formattingPreset: d.formatting_preset ?? null,
        },
      })),
    [documents],
  )

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
            <span className="text-sm font-medium">My documents</span>
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
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary hover:bg-[var(--accent-hover)] text-white text-sm font-semibold border-none cursor-pointer transition-all shadow-md shadow-primary/25"
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
          <h2 className="text-sm font-semibold tracking-tight text-foreground px-1">Suggested folders</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {folders.map((f) => {
              const item: DriveItem = {
                id: f.folder_id,
                kind: 'folder',
                title: f.name,
                updatedAt: f.updated_at,
                previewHtml: '',
                pageSetup: { pageSize: null, orientation: null, margins: null, formattingPreset: null },
              }
              const isEditing = editing?.id === f.folder_id
              const isSelected = selectedIds.has(f.folder_id)
              const isClass = f.folder_type === 'class'
              // Only the folder's owner manages the roster. An enrolled student
              // sees the same card but must not get the management entry.
              const canManageRoster = isClass && Boolean(user?.id) && f.user_id === user?.id
              const FolderGlyph = isClass ? GraduationCap : FolderIcon

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
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl cursor-pointer transition-all duration-200 border ${
                    isSelected
                      ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/40 shadow-sm'
                      : isClass
                        ? 'bg-card/70 hover:bg-card border-border/70 hover:border-accent/60 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                        : 'bg-card/70 hover:bg-card border-border/70 hover:border-primary/40 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  {/* Top row: Icon glyph + code badge + actions menu */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`size-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isClass
                            ? 'bg-accent/15 text-accent-foreground group-hover:bg-accent/25'
                            : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                        }`}
                      >
                        <FolderGlyph className="size-5" strokeWidth={1.75} />
                      </div>
                      {isClass && f.class_code && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent/15 text-accent-foreground border border-accent/30 shrink-0">
                          {f.class_code}
                        </span>
                      )}
                    </div>

                    {!isEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-60 transition-all hover:opacity-100 hover:bg-foreground/5 group-hover:opacity-100 data-[state=open]:opacity-100 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            title="Folder actions"
                            aria-label="Folder actions"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={{ minWidth: '160px' }}>
                          {canManageRoster && (
                            <>
                              <DropdownMenuItem
                                onSelect={() => setRosterFolder(f)}
                                className="cursor-pointer gap-2 text-sm text-foreground"
                              >
                                <Users className="size-3.5" /> Manage roster
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
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

                  {/* Body: Title and term */}
                  <div className="min-w-0 mb-3">
                    {isEditing ? (
                      <input
                        value={editing.title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveEdit()
                          if (e.key === 'Escape') onCancelEdit()
                        }}
                        className="w-full h-8 rounded-lg bg-background text-foreground text-sm px-2.5 outline-none border border-ring font-medium"
                        style={{ fontFamily: 'inherit' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div>
                        <h3
                          className="text-[0.9375rem] font-semibold text-foreground truncate m-0 tracking-tight"
                          title={f.name}
                        >
                          {f.name}
                        </h3>
                        {isClass && f.academic_term && (
                          <p className="text-xs text-muted-foreground truncate m-0 mt-0.5 font-normal">
                            {f.academic_term}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer: Clean metadata line with subtle icons */}
                  {isClass ? (
                    <div className="flex items-center justify-between pt-2.5 border-t border-border/50 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 opacity-70" />
                        <span>{f.enrolled_count ?? 0} {f.enrolled_count === 1 ? 'student' : 'students'}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5 opacity-70" />
                        <span>{f.submission_count ?? 0} submitted</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground/80">
                      <span>Personal workspace</span>
                      {f.updated_at && <span>{formatDate(f.updated_at)}</span>}
                    </div>
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
      {/* Documents empty but folders exist: still give feedback below the grid. */}
      {!loading && items.length === 0 && folders.length > 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 px-8 text-center bg-secondary/30 mt-2">
          <FileText className="size-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold text-foreground">No documents yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
            Start by creating a blank document or pick an academic template like APA or IEEE.
          </p>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary hover:bg-[var(--accent-hover)] text-white text-sm font-semibold border-none cursor-pointer transition-all shadow-md shadow-primary/25"
            style={{ fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            <Plus className="size-4" /> Create a new document
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold tracking-tight text-foreground m-0">
              Files ({items.length})
            </h2>
            <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center justify-center size-7 rounded-md border-none cursor-pointer transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
                title="Grid view"
                aria-label="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center justify-center size-7 rounded-md border-none cursor-pointer transition-colors ${
                  viewMode === 'list'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
                title="List view"
                aria-label="List view"
              >
                <List className="size-3.5" />
              </button>
            </div>
          </div>

          <PreviewStyles />
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {items.map((item) => {
                const isEditing = editing?.id === item.id
                const isSelected = selectedIds.has(item.id)

                return (
                  <div
                    key={item.id}
                    draggable={!isEditing}
                    onDragStart={(e) => onDragStart(e, item.id)}
                    onClick={(e) => onSelect(item.id, e)}
                    onDoubleClick={() => handleDoubleClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    className={`group relative flex flex-col rounded-2xl cursor-pointer border overflow-hidden transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/40 shadow-sm'
                        : 'bg-card/70 hover:bg-card border-border/70 hover:border-primary/40 shadow-xs hover:shadow-md hover:-translate-y-1'
                    }`}
                  >
                    {/* Google Docs-style Storefront Window Preview: page 1 scaled to the card width */}
                    <div className="relative aspect-[8.5/11] bg-slate-100/90 border-b border-border/40 overflow-hidden p-2.5 flex items-center justify-center">
                      <DocumentPreview html={item.previewHtml} setup={item.pageSetup} />
                    </div>

                    {/* Card Footer */}
                    <div className="p-3.5 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                            <FileText className="size-3.5" />
                          </div>
                          {isEditing ? (
                            <input
                              value={editing.title}
                              onChange={(e) => onTitleChange(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onSaveEdit()
                                if (e.key === 'Escape') onCancelEdit()
                              }}
                              className="flex-1 min-w-0 h-7 rounded-md bg-background text-foreground text-sm px-2 outline-none border border-ring font-medium"
                              style={{ fontFamily: 'inherit' }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <h3
                              className="text-sm font-semibold text-foreground truncate m-0 tracking-tight"
                              title={item.title}
                            >
                              {item.title}
                            </h3>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {onShare && item.kind === 'file' && (
                              <button
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-60 transition-all hover:opacity-100 hover:bg-foreground/5 group-hover:opacity-100 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onShare(item.id)
                                }}
                                title="Share this document"
                                aria-label="Share this document"
                              >
                                <Share2 className="size-3.5" />
                              </button>
                            )}
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-60 transition-all hover:opacity-100 hover:bg-foreground/5 group-hover:opacity-100 data-[state=open]:opacity-100 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                title="Document actions"
                                aria-label="Document actions"
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
                              {onShare && item.kind === 'file' && (
                                <DropdownMenuItem
                                  onSelect={() => onShare(item.id)}
                                  className="cursor-pointer gap-2 text-sm text-foreground"
                                >
                                  <Share2 className="size-3.5" /> Share
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => onDelete(item.id, item.kind)}
                                className="cursor-pointer gap-2 text-sm text-destructive"
                              >
                                <Trash2 className="size-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>Opened {formatDate(item.updatedAt)}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">Doc</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <span className="w-8" />
                <span className="flex-1">Name</span>
                <span className="w-32 text-left hidden md:block">Last opened</span>
                <span className="w-32 text-left hidden md:block">Owner</span>
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
                    className={`group flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer border border-transparent transition-all duration-150 ${
                      isSelected
                        ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                        : 'hover:bg-card hover:border-border/60 hover:shadow-xs'
                    }`}
                  >
                    {/* Icon */}
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="size-4" strokeWidth={1.75} />
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
                            className="flex-1 min-w-0 h-8 rounded-md bg-background text-foreground text-sm px-2 outline-none border border-ring font-medium"
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
                        <div>
                          <span className="text-sm font-semibold text-foreground truncate block" title={item.title}>
                            {item.title}
                          </span>
                          <span className="block md:hidden text-xs text-muted-foreground truncate mt-0.5">
                            Opened • {formatDate(item.updatedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Reason suggested (using Modified date) */}
                    <span className="w-32 text-left text-xs font-medium text-muted-foreground shrink-0 truncate hidden md:block">
                      {formatDate(item.updatedAt)}
                    </span>

                    {/* Owner */}
                    <div className="w-32 items-center gap-2 text-left text-xs text-muted-foreground shrink-0 hidden md:flex">
                      <div className="size-5 rounded-full bg-primary/20 text-primary flex items-center justify-center overflow-hidden shrink-0 font-bold text-[10px]">
                        {displayName.substring(0, 2).toUpperCase()}
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
                                className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer opacity-60 transition-opacity hover:opacity-100 hover:bg-secondary group-hover:opacity-100 data-[state=open]:opacity-100 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                title="Document actions"
                                aria-label="Document actions"
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
                              {onShare && item.kind === 'file' && (
                                <DropdownMenuItem
                                  onSelect={() => onShare(item.id)}
                                  className="cursor-pointer gap-2 text-sm text-foreground"
                                >
                                  <Share2 className="size-3.5" /> Share
                                </DropdownMenuItem>
                              )}
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
          )}
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
          onShare={onShare ? () => onShare(ctxMenu.item.id) : undefined}
        />
      )}

      {/* ── Class roster ─────────────────────────────── */}
      {rosterFolder && (
        <ClassRosterModal
          folder={rosterFolder}
          onClose={() => setRosterFolder(null)}
          onChanged={onFoldersChanged}
        />
      )}
    </div>
  )
}