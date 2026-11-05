import { Check, ChevronDown, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { GENRE_OPTIONS, genreShortLabel, type DocumentGenre, type GenreSource } from '@/lib/genreSignals'

interface GenreBadgeProps {
  genre: DocumentGenre
  source: GenreSource
  /** Only the document owner can change the genre. */
  canEdit: boolean
  /** A genre, or null to return to auto-detection. */
  onChange: (genre: DocumentGenre | null) => void
}

/**
 * Toolbar badge showing which genre partition the document learns in ("IEEE · Auto"), with a
 * menu to override it. Suggestions only ever come from documents of the same genre.
 */
export function GenreBadge({ genre, source, canEdit, onChange }: GenreBadgeProps): JSX.Element {
  const label = `${genreShortLabel(genre)} · ${source === 'auto' ? 'Auto' : 'Manual'}`
  const title = `Document type: ${genreShortLabel(genre)} (${source === 'auto' ? 'detected from structure' : 'set manually'}). Formatting suggestions learn only from documents of this type.`

  const trigger = (
    <button
      type="button"
      aria-label={`${title}${canEdit ? ' Change document type.' : ''}`}
      title={title}
      disabled={!canEdit}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-transparent px-2.5 text-[11px] font-medium tabular-nums text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-default disabled:opacity-80 disabled:hover:bg-transparent"
    >
      <Sparkles aria-hidden className="size-3 opacity-70" strokeWidth={2} />
      <span>{label}</span>
      {canEdit && <ChevronDown aria-hidden className="size-3 opacity-50" />}
    </button>
  )

  if (!canEdit) return trigger

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" style={{ zIndex: 200 }}>
        <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
          Learn formatting from documents of type
        </DropdownMenuLabel>
        {GENRE_OPTIONS.map((option) => {
          const active = source === 'manual' && option.value === genre
          return (
            <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)} className="gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{option.label}</span>
                <span className="text-[11px] font-normal text-muted-foreground">{option.hint}</span>
              </span>
              {active && <Check aria-label="Selected" className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)} className="gap-2">
          <span className="flex-1">Auto-detect from structure</span>
          {source === 'auto' && <Check aria-label="Selected" className="size-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
