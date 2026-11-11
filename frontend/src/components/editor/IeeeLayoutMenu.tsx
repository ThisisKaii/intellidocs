import { BookOpen, Columns, Hash, LayoutTemplate, MoveHorizontal, Printer } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToolButton } from './RibbonControls'

export interface IeeeLayoutMenuProps {
  disabled: boolean
  /** The document has content to number or restructure. */
  hasContent: boolean
  onRenumber: () => void
  onRestructure: () => void
  onPreview: () => void
  columnsDraft: boolean
  onToggleColumnsDraft: () => void
  /** A table, figure or equation is selected and can run across both columns. */
  fullSpanAvailable: boolean
  fullSpanActive: boolean
  onToggleFullSpan: () => void
  /** Omitted when the host does not support the spread view. */
  spread?: { active: boolean; allowed: boolean; onChange: (value: boolean) => void }
}

const ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: '10px' } as const
const ICON_STYLE = { width: '14px', height: '14px', opacity: 0.75 } as const

/** IEEE layout tools in one dropdown: numbering, restructure, print preview, columns and spread view. */
export function IeeeLayoutMenu({
  disabled,
  hasContent,
  onRenumber,
  onRestructure,
  onPreview,
  columnsDraft,
  onToggleColumnsDraft,
  fullSpanAvailable,
  fullSpanActive,
  onToggleFullSpan,
  spread,
}: IeeeLayoutMenuProps): JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolButton
          icon={LayoutTemplate}
          title="IEEE layout"
          active={columnsDraft || Boolean(spread?.active)}
          disabled={disabled}
          onClick={() => undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">IEEE layout</DropdownMenuLabel>
        <DropdownMenuItem disabled={!hasContent} title="Renumber IEEE headings (I. II. A. 1))" onSelect={onRenumber}>
          <span style={ITEM_STYLE}><Hash style={ICON_STYLE} /> Renumber headings</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasContent} title="Restructure into IEEE format" onSelect={onRestructure}>
          <span style={ITEM_STYLE}><LayoutTemplate style={ICON_STYLE} /> Restructure into IEEE format…</span>
        </DropdownMenuItem>
        <DropdownMenuItem title="Exact IEEE print preview (two columns, PDF)" onSelect={onPreview}>
          <span style={ITEM_STYLE}><Printer style={ICON_STYLE} /> Print preview (two columns)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          title={columnsDraft ? 'Back to paged view' : 'Two-column draft (one long sheet, pagination off)'}
          onSelect={onToggleColumnsDraft}
        >
          <span style={ITEM_STYLE}><Columns style={ICON_STYLE} /> {columnsDraft ? 'Back to paged view' : 'Two-column draft'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!fullSpanAvailable}
          title={
            fullSpanAvailable
              ? 'Run the selected table, figure or equation across both columns (click again to undo)'
              : 'Select a table, figure or equation to run it across both columns'
          }
          onSelect={onToggleFullSpan}
        >
          <span style={ITEM_STYLE}><MoveHorizontal style={ICON_STYLE} /> {fullSpanActive ? 'Back to one column' : 'Span both columns'}</span>
        </DropdownMenuItem>
        {spread && (
          <DropdownMenuItem
            disabled={!spread.allowed}
            title={
              !spread.allowed
                ? 'Double-page view is optimized for 2-page papers'
                : spread.active
                  ? 'Single page view'
                  : 'Two page spread view (pages 1|2, 3|4)'
            }
            onSelect={() => spread.onChange(!spread.active)}
          >
            <span style={ITEM_STYLE}><BookOpen style={ICON_STYLE} /> {spread.active ? 'Single page view' : 'Double-page view'}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
