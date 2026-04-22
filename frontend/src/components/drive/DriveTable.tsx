import { Link } from 'react-router-dom'
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

/** Format a date string into a friendly label like "Today", "2 days ago", etc. */
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

/** Skeleton placeholder shown while documents are loading. */
function GridSkeleton(): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        width: '100%',
        minWidth: 0,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
        gap: '1rem',
        boxSizing: 'border-box',
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          style={{
            height: '148px',
            borderRadius: '0.75rem',
            backgroundColor: 'var(--secondary)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      ))}
    </div>
  )
}

/** Render documents as a Vercel-style project card grid. */
export function DriveTable({
  documents,
  loading,
  editing,
  onCreate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onTitleChange,
}: DriveTableProps): JSX.Element {
  if (loading) return <GridSkeleton />

  if (documents.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0.75rem',
          border: '1px dashed var(--border)',
          padding: '5rem 2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '0.75rem',
            backgroundColor: 'var(--secondary)',
            marginBottom: '1.25rem',
          }}
        >
          <FileText style={{ width: '24px', height: '24px', color: 'var(--muted-foreground)' }} />
        </div>
        <p
          style={{
            fontSize: '1rem',
            fontWeight: 500,
            color: 'var(--foreground)',
            margin: '0 0 0.375rem',
          }}
        >
          No projects yet
        </p>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)',
            margin: '0 0 1.5rem',
          }}
        >
          Create your first document to get started
        </p>
        <button
          onClick={onCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            height: '38px',
            padding: '0 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus style={{ width: '14px', height: '14px' }} />
          New document
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        width: '100%',
        minWidth: 0,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
        gap: '1rem',
        boxSizing: 'border-box',
      }}
    >
      {documents.map((doc) => {
        const isEditing = editing?.id === doc.id
        return (
          <div
            key={doc.id}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minWidth: 0,
              height: '148px',
              overflow: 'hidden',
              boxSizing: 'border-box',
              borderRadius: '0.75rem',
              backgroundColor: 'var(--card)',
              padding: '1.125rem 1.25rem',
              boxShadow:
                'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 4px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
              transition: 'box-shadow 200ms',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                'rgba(0,0,0,0.12) 0px 0px 0px 1px, rgba(0,0,0,0.08) 0px 4px 12px, inset 0px 0px 0px 1px var(--card-shadow-inner)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 4px, inset 0px 0px 0px 1px var(--card-shadow-inner)'
            }}
          >
            {/* Top row: icon + title + menu */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <FileText style={{ width: '16px', height: '16px', color: 'var(--foreground)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <input
                      value={editing.title}
                      onChange={(e) => onTitleChange(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSaveEdit()
                        if (e.key === 'Escape') onCancelEdit()
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: '32px',
                        borderRadius: '0.5rem',
                        border: 'none',
                        boxShadow:
                          '0 0 0 1px var(--border), 0 8px 24px rgba(15,23,42,0.08)',
                        backgroundColor: 'var(--popover)',
                        color: 'var(--popover-foreground)',
                        fontSize: '0.875rem',
                        padding: '0 0.625rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={onSaveEdit}
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '0.5rem',
                        border: 'none',
                        backgroundColor: 'var(--foreground)',
                        color: 'var(--background)',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.12)',
                      }}
                    >
                      <Check style={{ width: '13px', height: '13px' }} />
                    </button>
                  </div>
                ) : (
                  <Link
                    to={`/document/${doc.id}`}
                    style={{
                      display: 'block',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      color: 'var(--foreground)',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.3,
                    }}
                    title={doc.title}
                  >
                    {doc.title}
                  </Link>
                )}
              </div>

              {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '0.5rem',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                        opacity: 0,
                        transition: 'opacity 150ms, background-color 150ms',
                      }}
                      className="card-menu-btn"
                    >
                      <MoreVertical style={{ width: '14px', height: '14px' }} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="rounded-xl"
                    style={{
                      minWidth: '156px',
                    }}
                  >
                    <DropdownMenuItem
                      onSelect={() => onStartEdit(doc)}
                      className="cursor-pointer gap-2 text-sm text-foreground"
                    >
                      <Pencil style={{ width: '14px', height: '14px' }} />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onDelete(doc.id)}
                      className="cursor-pointer gap-2 text-sm text-destructive"
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Bottom row: date + badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border)',
                marginTop: 'auto',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.01em',
                }}
              >
                {formatDate(doc.updated_at)}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.175rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--muted-foreground)',
                  border: '1px solid var(--border)',
                }}
              >
                Document
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}