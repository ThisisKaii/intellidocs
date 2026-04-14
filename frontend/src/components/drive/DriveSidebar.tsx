import { Button } from '@/components/ui/button'
import {
  Home,
  FileText,
  Clock3,
  Star,
  Trash,
  Plus,
  type LucideIcon,
} from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: LucideIcon
}

interface DriveSidebarProps {
  activeId?: string
  onCreate: () => void
}

const items: SidebarItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'drive', label: 'My Documents', icon: FileText },
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'trash', label: 'Trash', icon: Trash },
]

/** Left navigation sidebar styled like Google Drive with a New button. */
function DriveSidebar({
  activeId = 'home',
  onCreate,
}: DriveSidebarProps): JSX.Element {
  return (
    <aside className="flex flex-col w-60 shrink-0 border-r border-border/70 bg-muted/20 py-4 pr-3 pl-3 gap-4">
      {/* New document button — pill shaped like Google Drive */}
      <Button
        onClick={onCreate}
        variant="outline"
        className="flex items-center gap-3 self-start rounded-full h-12 px-5 text-foreground shadow-sm bg-muted/40 border border-border/60 hover:bg-muted/60 hover:shadow-md transition-all duration-200"
      >
        <Plus className="size-6 text-primary" />
        <span className="text-sm font-medium text-foreground">New</span>
      </Button>

      {/* Navigation links */}
      <nav className="flex flex-col gap-0.5 mt-1">
        {items.map((item) => {
          const isActive = item.id === activeId
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 border bg-transparent ${
                isActive
                  ? 'bg-muted/50 text-foreground border-border/80'
                  : 'text-muted-foreground border-transparent hover:bg-muted/30 hover:text-foreground'
              }`}
            >
              <Icon className={`size-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Storage indicator */}
      <div className="mt-auto px-4 pb-2">
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div className="h-full w-1/4 rounded-full bg-primary transition-all" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Free tier
        </p>
      </div>
    </aside>
  )
}

export default DriveSidebar