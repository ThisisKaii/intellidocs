import { type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileText, LogOut, Plus, Search } from 'lucide-react'

interface DriveHeaderProps {
  query: string
  onQueryChange: (value: string) => void
  onCreate: () => void
  onLogout: () => void
}

/** Drive-style top header with search and actions. */
export function DriveHeader({
  query,
  onQueryChange,
  onCreate,
  onLogout,
}: DriveHeaderProps): JSX.Element {
  /** Handle search input changes. */
  function handleQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    onQueryChange(event.target.value)
  }

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

        <div className="relative ml-2 flex-1 max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={handleQueryChange}
            placeholder="Search in documents"
            className="h-9 w-full rounded-full pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
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