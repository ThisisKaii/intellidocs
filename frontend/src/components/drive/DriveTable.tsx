import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Check,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

export interface DriveDocumentRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface DriveTableEditState {
  id: string
  title: string
}

interface DriveTableProps {
  documents: DriveDocumentRow[]
  loading: boolean
  error: string
  editing: DriveTableEditState | null
  onCreate: () => void
  onStartEdit: (doc: DriveDocumentRow) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: (id: string) => void
  onTitleChange: (nextTitle: string) => void
}

/** Format ISO date string to a human-friendly label. */
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

/** Render a loading skeleton for the document list. */
function TableSkeleton(): JSX.Element {
  return (
    <div className="space-y-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg px-4 py-3 animate-pulse"
        >
          <div className="size-9 rounded-md bg-muted/60" />
          <div className="h-4 flex-1 rounded bg-muted/60 max-w-[280px]" />
          <div className="h-4 w-24 rounded bg-muted/60 ml-auto" />
        </div>
      ))}
    </div>
  )
}

/** Drive-style document table with inline rename and dropdown actions. */
export function DriveTable({
  documents,
  loading,
  error,
  editing,
  onCreate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onTitleChange,
}: DriveTableProps): JSX.Element {
  const countLabel = useMemo(() => {
    return `${documents.length} document${documents.length !== 1 ? 's' : ''}`
  }, [documents.length])

  if (loading) {
    return <TableSkeleton />
  }

  return (
    <div className="w-full min-w-0 space-y-1">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive mb-3">
          {error}
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 px-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted/60 mb-4">
            <FileText className="size-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">
            No documents yet
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            Create your first document to get started
          </p>
          <Button
            onClick={onCreate}
            className="rounded-full px-5 bg-primary text-primary-foreground hover:bg-primary/80"
          >
            <Plus className="mr-1.5 size-4" />
            Create document
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-sm font-medium text-foreground">
              Suggested files
            </h2>
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          </div>

          <div className="flex items-center px-4 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
            <div className="flex-1 min-w-0">Name</div>
            <div className="w-40 shrink-0 text-left hidden sm:block">
              Last modified
            </div>
            <div className="w-10 shrink-0" />
          </div>

          {documents.map((doc) => {
            const isEditing = editing?.id === doc.id
            return (
              <div
                key={doc.id}
                className="group flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors duration-100 hover:bg-muted/30"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15">
                  <FileText className="size-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        className="h-8 flex-1 rounded-md border border-primary bg-card px-2.5 text-sm text-foreground outline-none ring-2 ring-primary/30"
                        value={editing.title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveEdit()
                          if (e.key === 'Escape') onCancelEdit()
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onSaveEdit}
                        className="rounded-full hover:bg-muted/60"
                        title="Save"
                      >
                        <Check className="size-4 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onCancelEdit}
                        className="rounded-full hover:bg-muted/60"
                        title="Cancel"
                      >
                        <X className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <Link
                      to={`/document/${doc.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:text-primary transition-colors"
                      title={doc.title}
                    >
                      {doc.title}
                    </Link>
                  )}
                </div>

                <div className="w-40 shrink-0 text-sm text-muted-foreground hidden sm:block">
                  You opened · {formatDate(doc.updated_at)}
                </div>

                {!isEditing ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity bg-muted/40 hover:bg-muted/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                        title={`Actions for ${doc.title}`}
                      >
                        <MoreVertical className="size-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[160px] bg-muted/90 border-border/60 shadow-2xl backdrop-blur"
                    >
                      <DropdownMenuItem
                        onSelect={() => onStartEdit(doc)}
                        className="cursor-pointer gap-2"
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDelete(doc.id)}
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}