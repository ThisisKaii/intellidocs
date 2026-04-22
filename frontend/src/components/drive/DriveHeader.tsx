import { Button } from '@/components/ui/button'
import { FileText, LogOut, Plus, Search } from 'lucide-react'

interface DriveHeaderProps {
  query: string
  onQueryChange: (value: string) => void
  onCreate: () => void
  onLogout: () => void
}

export function DriveHeader({
  query,
  onQueryChange,
  onCreate,
  onLogout,
}: DriveHeaderProps): JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="size-5 text-foreground" />
          <span className="font-semibold tracking-tight text-foreground">IntelliDocs</span>
        </div>

        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search documents..."
              className="h-9 w-full rounded-md bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/80 outline-none transition-colors focus:bg-background focus:border-shadow"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={onCreate}>
            <Plus className="mr-1 size-3.5" />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="mr-1 size-3.5" />
            Log out
          </Button>
        </div>
      </div>
    </header>
  )
}