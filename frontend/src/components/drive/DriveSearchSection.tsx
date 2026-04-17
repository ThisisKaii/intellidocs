import { type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  ChevronDown,
  File,
  Folder,
  Search,
  Users,
} from 'lucide-react'

interface DriveSearchSectionProps {
  query: string
  onQueryChange: (value: string) => void
}

/** Welcome banner, search bar, and filter chips styled like Google Drive. */
export function DriveSearchSection({
  query,
  onQueryChange,
}: DriveSearchSectionProps): JSX.Element {
  /** Handle search input changes. */
  function handleQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    onQueryChange(event.target.value)
  }

  return (
    <section className="mb-8">
      {/* Welcome text — centered like Google Drive */}
      <h1 className="mb-5 text-center text-2xl font-normal tracking-tight text-foreground">
        Welcome to IntelliDocs
      </h1>

      {/* Search bar — large rounded pill with elevated card surface */}
      <div className="mx-auto max-w-2xl">
        <div className="relative group">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <input
            value={query}
            onChange={handleQueryChange}
            placeholder="Search in IntelliDocs"
            className="h-12 w-full rounded-full border border-border bg-card pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:bg-card focus:shadow-none focus:ring-2 focus:ring-primary/15 focus:border-primary/50"
          />
        </div>

        {/* Filter chips — pill buttons */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            className="rounded-full border-border h-8 px-3 text-sm font-normal text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            size="sm"
          >
            <File className="mr-1.5 size-4" />
            Type
            <ChevronDown className="ml-1 size-3.5 opacity-60" />
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border h-8 px-3 text-sm font-normal text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            size="sm"
          >
            <Users className="mr-1.5 size-4" />
            People
            <ChevronDown className="ml-1 size-3.5 opacity-60" />
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border h-8 px-3 text-sm font-normal text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            size="sm"
          >
            <Calendar className="mr-1.5 size-4" />
            Modified
            <ChevronDown className="ml-1 size-3.5 opacity-60" />
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border h-8 px-3 text-sm font-normal text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            size="sm"
          >
            <Folder className="mr-1.5 size-4" />
            Location
            <ChevronDown className="ml-1 size-3.5 opacity-60" />
          </Button>
        </div>
      </div>
    </section>
  )
}