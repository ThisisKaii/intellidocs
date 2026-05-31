import {
  FileText,
  Clock3,
  Trash,
  Plus,
  FolderIcon,
  type LucideIcon,
} from 'lucide-react'


interface SidebarItem {
  id: string
  label: string
  icon: LucideIcon
  selectionType: FolderSelection['type']
}

/** Describes which view/section the sidebar has selected. */
export interface FolderSelection {
  type: 'all' | 'folder' | 'recent' | 'trash'
  folderId?: string
  folderName?: string
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DriveSidebarProps {
  selection: FolderSelection
  onCreate: () => void
  onCreateFolder: () => void
  onSelectView: (sel: FolderSelection) => void
}

const NAV_ITEMS: SidebarItem[] = [
  { id: 'drive', label: 'My Documents', icon: FileText, selectionType: 'all' },
  { id: 'recent', label: 'Recent', icon: Clock3, selectionType: 'recent' },
  { id: 'trash', label: 'Trash', icon: Trash, selectionType: 'trash' },
]

/** Left sidebar with navigation, folder tree, and new-item button. */
function DriveSidebar({
  selection,
  onCreate,
  onCreateFolder,
  onSelectView,
}: DriveSidebarProps): JSX.Element {
  function isNavActive(item: SidebarItem): boolean {
    if (selection.type === 'folder') return false
    return item.selectionType === selection.type
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
          <DropdownMenuContent align="start" style={{ minWidth: '160px' }}>
            <DropdownMenuItem onClick={onCreate} className="gap-2 py-2 cursor-pointer">
              <FileText className="size-4" /> New Document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateFolder} className="gap-2 py-2 cursor-pointer">
              <FolderIcon className="size-4 text-[#4285f4]" /> New Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Navigation ─────────────────────────────── */}
      <nav className="flex flex-col px-3 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item)
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView({ type: item.selectionType })}
              className={`flex items-center gap-3 w-full px-4 h-10 rounded-full text-[0.875rem] border-none cursor-pointer text-left transition-colors ${
                active
                  ? 'font-medium text-[#001d35] bg-[#c2e7ff]'
                  : 'font-normal text-[#444746] hover:bg-black/5'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              <Icon className={`size-[18px] ${active ? 'text-[#001d35]' : 'text-[#444746]'}`} strokeWidth={active ? 2 : 1.75} />
              {item.label}
            </button>
          )
        })}
      </nav>

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