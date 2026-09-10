import {
  FileText,
  Clock3,
  Trash,
  Share2,
  Plus,
  FolderIcon,
  HardDrive,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { FolderRecord } from '@/services/api'
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
  type: 'all' | 'folder' | 'recent' | 'trash' | 'shared'
  folderId?: string
  folderName?: string
}

interface DriveSidebarProps {
  selection: FolderSelection
  onCreate: () => void
  onCreateFolder: () => void
  onSelectView: (sel: FolderSelection) => void
  onImportFromFile?: () => void
  onImportFromDrive?: () => void
  /** Badge counts for the main navigation items. */
  documentCount?: number
  recentCount?: number
  trashCount?: number
  /** Quick-access folders listed under the navigation. */
  folders?: FolderRecord[]
}

const NAV_ITEMS: SidebarItem[] = [
  { id: 'drive', label: 'My Documents', icon: FileText, selectionType: 'all' },
  { id: 'recent', label: 'Recent', icon: Clock3, selectionType: 'recent' },
  { id: 'shared', label: 'Shared with me', icon: Share2, selectionType: 'shared' },
  { id: 'trash', label: 'Trash', icon: Trash, selectionType: 'trash' },
]

/** Left sidebar with navigation, folder tree, and new-item button. */
function DriveSidebar({
  selection,
  onCreate,
  onCreateFolder,
  onSelectView,
  onImportFromFile,
  onImportFromDrive,
  documentCount,
  recentCount,
  trashCount,
  folders,
}: DriveSidebarProps): JSX.Element {
  function isNavActive(item: SidebarItem): boolean {
    if (selection.type === 'folder') return false
    return item.selectionType === selection.type
  }

  /** Badge count for a nav item, or undefined when there is nothing to show. */
  function navCount(item: SidebarItem): number | undefined {
    if (item.selectionType === 'all') return documentCount
    if (item.selectionType === 'recent') return recentCount
    if (item.selectionType === 'trash') return trashCount
    return undefined
  }

  return (
    <aside className="flex flex-col w-[260px] shrink-0 bg-background h-screen sticky top-0 overflow-y-auto">
      {/* ── Logo area ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 mt-2">
        <div className="flex items-center justify-center w-8 h-8 rounded bg-primary">
          <FileText className="size-5 text-primary-foreground" strokeWidth={2} />
        </div>
        <span className="text-[1.25rem] font-medium tracking-tight text-foreground">
          IntelliDocs
        </span>
      </div>

      {/* ── New button ─────────────────────────────── */}
      <div className="px-4 mt-4 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center gap-2 h-14 w-[120px] rounded-2xl bg-background text-foreground text-sm font-medium border-none cursor-pointer transition-all hover:bg-secondary active:scale-[0.98]"
              style={{
                fontFamily: 'inherit',
                boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
              }}
            >
              <Plus className="size-5" />
              <span>New</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" style={{ minWidth: '180px' }}>
            <DropdownMenuItem onClick={onCreate} className="gap-2 py-2 cursor-pointer">
              <FileText className="size-4" /> New Document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateFolder} className="gap-2 py-2 cursor-pointer">
              <FolderIcon className="size-4 text-primary" /> New Folder
            </DropdownMenuItem>
            {onImportFromFile && (
              <DropdownMenuItem onClick={onImportFromFile} className="gap-2 py-2 cursor-pointer">
                <Upload className="size-4 text-primary" /> Import from File
              </DropdownMenuItem>
            )}
            {onImportFromDrive && (
              <DropdownMenuItem onClick={onImportFromDrive} className="gap-2 py-2 cursor-pointer">
                <HardDrive className="size-4 text-primary" /> Import from Drive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Navigation ─────────────────────────────── */}
      <nav className="flex flex-col px-3 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item)
          const Icon = item.icon
          const count = navCount(item)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView({ type: item.selectionType })}
              className={`flex items-center gap-3 w-full px-4 h-10 rounded-full text-[0.875rem] border-none cursor-pointer text-left transition-colors ${
                active
                  ? 'font-medium text-primary bg-primary/15'
                  : 'font-normal text-muted-foreground hover:bg-foreground/5'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              <Icon className={`size-[18px] ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{item.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`ml-auto text-[0.6875rem] font-medium rounded-full px-2 py-0.5 ${
                    active ? 'bg-primary/15 text-primary' : 'bg-foreground/5 text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Quick-access folders ───────────────────── */}
      {folders && folders.length > 0 && (
        <div className="mt-6">
          <div className="px-4 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Folders
          </div>
          <nav className="flex flex-col px-3 gap-0.5">
            {folders.slice(0, 6).map((folder) => {
              const active = selection.type === 'folder' && selection.folderId === folder.folder_id
              return (
                <button
                  key={folder.folder_id}
                  type="button"
                  onClick={() =>
                    onSelectView({ type: 'folder', folderId: folder.folder_id, folderName: folder.name })
                  }
                  className={`flex items-center gap-3 w-full px-4 h-9 rounded-full text-[0.8125rem] border-none cursor-pointer text-left transition-colors ${
                    active
                      ? 'font-medium text-primary bg-primary/15'
                      : 'font-normal text-muted-foreground hover:bg-foreground/5'
                  }`}
                  style={{ fontFamily: 'inherit' }}
                >
                  <FolderIcon className={`size-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2 : 1.75} />
                  <span className="truncate">{folder.name}</span>
                </button>
              )
            })}
          </nav>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────── */}
      <div className="mt-auto px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Storage</span>
        </div>
        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground/30 transition-all"
            style={{ width: '15%' }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Free tier</div>
      </div>
    </aside>
  )
}

export default DriveSidebar