import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle'
import { FileText, LogOut, Plus } from 'lucide-react'

interface DriveHeaderProps {
  query: string
  onQueryChange: (value: string) => void
  onCreate: () => void
  onLogout: () => void
}

/** Drive-style top header with search and actions. */
export function DriveHeader({
  query: _query,
  onQueryChange: _onQueryChange,
  onCreate,
  onLogout,
}: DriveHeaderProps): JSX.Element {
  /** Create a new document. */
  function handleCreate(): void {
    onCreate()
  }

  /** Log out of the session. */
  function handleLogout(): void {
    onLogout()
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center gap-3 px-4">
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">IntelliDocs</span>
        </div>

        <div className="flex-1" />

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1 size-3.5" />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 size-3.5" />
            Log out
          </Button>
        </div>
      </div>
    </header>
  )
}