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
    <aside className="flex flex-col w-[260px] shrink-0 bg-secondary h-screen sticky top-0 overflow-y-auto">
      {/* ── Logo area ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 mt-2">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-sm shadow-primary/30 text-primary-foreground">
          <FileText className="size-5 stroke-[2.2]" />
        </div>
        <div className="flex flex-col">
          <span className="text-[1.2rem] font-bold tracking-tight text-foreground leading-tight">
            IntelliDocs
          </span>
          <span className="text-[0.625rem] font-semibold tracking-wider uppercase text-primary">
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
              <span>New Document</span>
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
                  ? 'font-semibold text-foreground bg-accent shadow-xs'
                  : 'font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              <Icon className={`size-[18px] ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{item.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`ml-auto text-[0.6875rem] font-medium rounded-full px-2 py-0.5 ${
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

      {/* ── Storage status card ───────────────────── */}
      <div className="mt-auto p-3.5 m-3 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
          <span className="text-primary font-bold flex items-center gap-1.5">
            <HardDrive className="size-3.5" /> Storage
          </span>
          <span className="text-xs text-foreground font-semibold">124 MB / 500 MB</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: '25%' }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-[0.6875rem]">
          <span className="font-semibold text-primary">Student Tier</span>
          <span className="text-muted-foreground">UCLM Capstone</span>
        </div>
      </div>
    </aside>
  )
}

export default DriveSidebar