import { useState } from 'react'
import {
  Sparkles,
  FileText,
  Clock3,
  Trash,
  Share2,
  Plus,
  FolderIcon,
  GraduationCap,
  HardDrive,
  Pin,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { FolderRecord, StorageSummary } from '@/services/api'
import { LogoMark } from '@/components/Logo'
import { UpgradeModal } from '@/components/billing/UpgradeModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'


interface SidebarItem {
  id: string
  label: string
  icon: LucideIcon
  selectionType: FolderSelection['type']
}

/** Describes which view/section the sidebar has selected. */
export interface FolderSelection {
  type: 'all' | 'folder' | 'recent' | 'trash' | 'shared' | 'pinned' | 'classes'
  folderId?: string
  folderName?: string
}

interface DriveSidebarProps {
  selection: FolderSelection
  onCreate: () => void
  onCreateFolder: () => void
  /** Opens the join-a-class dialog. */
  onJoinClass?: () => void
  onSelectView: (sel: FolderSelection) => void
  onImportFromFile?: () => void
  onImportFromDrive?: () => void
  /** Badge counts for the main navigation items. */
  documentCount?: number
  recentCount?: number
  pinnedCount?: number
  trashCount?: number
  /** Quick-access folders listed under the navigation. */
  folders?: FolderRecord[]
  /** Whether the slide-over drawer is open on mobile (< 1024px). Desktop ignores it. */
  isOpen: boolean
  /** Close the mobile drawer after any navigation/selection. */
  onClose: () => void
  /** Signed-in user's storage usage and quota for the status card. */
  storage?: StorageSummary | null
}

/** Format a byte count into a compact human-readable string (e.g. 12.5 MB). */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

/** Capitalize the first letter of a word, e.g. 'student' → 'Student'. */
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const MAIN_NAV_ITEMS: SidebarItem[] = [
  { id: 'drive', label: 'My documents', icon: FileText, selectionType: 'all' },
  { id: 'recent', label: 'Recent', icon: Clock3, selectionType: 'recent' },
  { id: 'shared', label: 'Shared with me', icon: Share2, selectionType: 'shared' },
  { id: 'pinned', label: 'Pinned', icon: Pin, selectionType: 'pinned' },
  // The classes the user teaches or joined; the view itself has the Join button.
  { id: 'classes', label: 'Class folders', icon: GraduationCap, selectionType: 'classes' },
]

const TRASH_ITEM: SidebarItem = {
  id: 'trash',
  label: 'Trash',
  icon: Trash,
  selectionType: 'trash',
}

/** Left sidebar with navigation, folder tree, and new-item button. */
function DriveSidebar({
  selection,
  onCreate,
  onCreateFolder,
  onJoinClass,
  onSelectView,
  onImportFromFile,
  onImportFromDrive,
  documentCount,
  recentCount,
  pinnedCount,
  trashCount,
  folders,
  isOpen,
  onClose,
  storage,
}: DriveSidebarProps): JSX.Element {
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  function isNavActive(item: SidebarItem): boolean {
    if (selection.type === 'folder') return false
    return item.selectionType === selection.type
  }

  /** Badge count for a nav item, or undefined when there is nothing to show. */
  function navCount(item: SidebarItem): number | undefined {
    if (item.selectionType === 'all') return documentCount
    if (item.selectionType === 'recent') return recentCount
    if (item.selectionType === 'pinned') return pinnedCount
    if (item.selectionType === 'trash') return trashCount
    if (item.selectionType === 'classes') return folders?.filter((f) => f.folder_type === 'class').length
    return undefined
  }

  return (
    <aside
      className={`flex flex-col w-[260px] shrink-0 bg-secondary h-screen overflow-y-auto fixed inset-y-0 left-0 z-40 shadow-xl transition-transform duration-300 ease-in-out lg:static lg:sticky lg:top-0 lg:shadow-none lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* ── Logo area ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 mt-2">
        <LogoMark size={36} title="IntelliDocs" />
        <div className="flex flex-col">
          <span className="text-[1.2rem] font-bold tracking-tight text-foreground leading-tight">
            IntelliDocs
          </span>
          <span className="text-[0.75rem] font-semibold tracking-wider uppercase text-primary">
            Academic Suite
          </span>
        </div>
      </div>

      {/* ── New button ─────────────────────────────── */}
      <div className="px-4 mt-4 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center gap-2.5 h-12 w-full rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold border-none cursor-pointer transition-all shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 active:scale-[0.98]"
              style={{ fontFamily: 'inherit' }}
            >
              <div className="flex items-center justify-center size-6 rounded-lg bg-primary-foreground/20 text-primary-foreground">
                <Plus className="size-4 stroke-[2.5]" />
              </div>
              <span>New content</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" style={{ minWidth: '180px' }}>
            <DropdownMenuItem onClick={() => { onClose(); onCreate() }} className="gap-2 py-2 cursor-pointer">
              <FileText className="size-4" /> New content
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onClose(); onCreateFolder() }} className="gap-2 py-2 cursor-pointer">
              <FolderIcon className="size-4 text-primary" /> New folder
            </DropdownMenuItem>
            {onJoinClass && (
              <DropdownMenuItem onClick={() => { onClose(); onJoinClass() }} className="gap-2 py-2 cursor-pointer">
                <GraduationCap className="size-4 text-primary" /> Join a class
              </DropdownMenuItem>
            )}
            {onImportFromFile && (
              <DropdownMenuItem onClick={() => { onClose(); onImportFromFile() }} className="gap-2 py-2 cursor-pointer">
                <Upload className="size-4 text-primary" /> Import from file
              </DropdownMenuItem>
            )}
            {onImportFromDrive && (
              <DropdownMenuItem onClick={() => { onClose(); onImportFromDrive() }} className="gap-2 py-2 cursor-pointer">
                <HardDrive className="size-4 text-primary" /> Import from Drive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Main Navigation ───────────────────────── */}
      <nav className="flex flex-col px-3 gap-0.5">
        {MAIN_NAV_ITEMS.map((item) => {
          const active = isNavActive(item)
          const Icon = item.icon
          const count = navCount(item)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView({ type: item.selectionType })
                onClose()
              }}
              className={`flex items-center gap-3 w-full px-4 h-10 rounded-full text-[0.875rem] border-none cursor-pointer text-left transition-all duration-150 ease-out hover:translate-x-1 ${
                active
                  ? 'font-semibold text-foreground bg-accent shadow-xs'
                  : 'font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              <Icon className={`size-[18px] ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{item.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`ml-auto text-xs font-medium tabular-nums rounded-full px-2 py-0.5 ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Trash, closing the navigation ─────────── */}
      <nav className="flex flex-col px-3 gap-0.5 mt-0.5">
        {(() => {
          const active = isNavActive(TRASH_ITEM)
          const Icon = TRASH_ITEM.icon
          const count = navCount(TRASH_ITEM)
          return (
            <button
              key={TRASH_ITEM.id}
              type="button"
              onClick={() => {
                onSelectView({ type: TRASH_ITEM.selectionType })
                onClose()
              }}
              className={`flex items-center gap-3 w-full px-4 h-10 rounded-full text-[0.875rem] border-none cursor-pointer text-left transition-all duration-150 ease-out hover:translate-x-1 ${
                active
                  ? 'font-semibold text-foreground bg-accent shadow-xs'
                  : 'font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              <Icon className={`size-[18px] ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{TRASH_ITEM.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`ml-auto text-xs font-medium tabular-nums rounded-full px-2 py-0.5 ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })()}
      </nav>

      {/* ── Folders (regular folders), below Trash ──── */}
      {(() => {
        const regularFolders = folders?.filter((f) => f.folder_type !== 'class') ?? []
        if (regularFolders.length === 0) return null
        return (
          <div className="mt-5">
            <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Folders
            </div>
            <nav className="flex flex-col px-3 gap-0.5">
              {regularFolders.map((folder) => {
                const active = selection.type === 'folder' && selection.folderId === folder.folder_id
                return (
                  <button
                    key={folder.folder_id}
                    type="button"
                    onClick={() => {
                      onSelectView({ type: 'folder', folderId: folder.folder_id, folderName: folder.name })
                      onClose()
                    }}
                    title={folder.name}
                    className={`flex items-center gap-3 w-full px-4 h-9 rounded-full text-[0.8125rem] border-none cursor-pointer text-left transition-colors ${
                      active
                        ? 'font-medium text-primary bg-primary/15'
                        : 'font-normal text-muted-foreground hover:bg-foreground/5'
                    }`}
                    style={{ fontFamily: 'inherit' }}
                  >
                    <FolderIcon
                      className={`size-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                      strokeWidth={active ? 2 : 1.75}
                    />
                    <span className="truncate">{folder.name}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        )
      })()}

      {/* ── Storage status card ───────────────────── */}
      <div className="mt-auto p-3.5 m-3 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
          <span className="text-primary font-bold flex items-center gap-1.5">
            <HardDrive className="size-3.5" /> Storage
          </span>
          <span className="text-xs text-foreground font-semibold tabular-nums">
            {storage ? `${formatBytes(storage.usedBytes)} / ${storage.quotaBytes === null ? 'Unlimited' : formatBytes(storage.quotaBytes)}` : '— / —'}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: storage && storage.quotaBytes !== null ? `${Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100))}%` : '0%' }}
          />
        </div>
        {storage && storage.quotaBytes !== null && storage.usedBytes / storage.quotaBytes >= 0.8 && (
          <p className="m-0 mt-2 text-xs text-destructive">
            {storage.usedBytes >= storage.quotaBytes ? 'Storage full.' : 'Almost full.'} Delete documents or empty the Trash to free space.
          </p>
        )}
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="font-semibold text-primary">{storage ? (storage.plan === 'pro' ? 'Pro' : storage.role === 'user' ? 'Basic Tier' : `${capitalize(storage.role)} Tier`) : '—'}</span>
          <span className="text-muted-foreground">UCLM Capstone</span>
        </div>
        {storage && storage.plan !== 'pro' && (
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="inline-flex items-center gap-1.5 mt-2.5 p-0 text-xs font-semibold text-primary bg-transparent border-none cursor-pointer hover:underline"
            style={{ fontFamily: 'inherit' }}
          >
            <Sparkles className="size-3.5" /> Upgrade storage
          </button>
        )}
      </div>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </aside>
  )
}

export default DriveSidebar