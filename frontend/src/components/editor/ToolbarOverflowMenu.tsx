import { Download, FileText, UserCog } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToolButton } from './RibbonControls'

export interface ToolbarExportActions {
  onWord: () => void
  onPdf: () => void
}

interface ToolbarOverflowMenuProps {
  disabled: boolean
  exportActions: ToolbarExportActions
  onOpenPersonalization?: () => void
}

const ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: '10px' } as const
const ICON_STYLE = { width: '14px', height: '14px', opacity: 0.75 } as const

/** Export and personalization as one compact right-hand dropdown, so they never wrap the ribbon. */
export function ToolbarOverflowMenu({ disabled, exportActions, onOpenPersonalization }: ToolbarOverflowMenuProps): JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolButton icon={Download} title="Export or Print Document" ariaLabel="Export" disabled={disabled} onClick={() => undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Export</DropdownMenuLabel>
        <DropdownMenuItem onSelect={exportActions.onWord}>
          <span style={ITEM_STYLE}><FileText style={ICON_STYLE} /> Word (.docx)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportActions.onPdf}>
          <span style={ITEM_STYLE}><FileText style={ICON_STYLE} /> PDF (.pdf)</span>
        </DropdownMenuItem>
        {onOpenPersonalization && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem title="Export or import your personalization profile (.idocprofile)" onSelect={onOpenPersonalization}>
              <span style={ITEM_STYLE}><UserCog style={ICON_STYLE} /> Personalization profile…</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
