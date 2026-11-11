import { Download, FileCode, FileText, GraduationCap, Printer, UserCog } from 'lucide-react'
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
  /** IEEE papers export an IEEE Word file; everything else a thesis Word file. */
  ieee: boolean
  onIeeeWord: () => void
  onThesisWord: () => void
  onPdf: () => void
  onHtml: () => void
  onPrint: () => void
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
          <span style={ITEM_STYLE}><FileText style={ICON_STYLE} /> Word (.doc / .docx)</span>
        </DropdownMenuItem>
        {exportActions.ieee ? (
          <DropdownMenuItem onSelect={exportActions.onIeeeWord}>
            <span style={ITEM_STYLE}><FileText style={ICON_STYLE} /> IEEE paper (Word)</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={exportActions.onThesisWord}>
            <span style={ITEM_STYLE}><GraduationCap style={ICON_STYLE} /> Thesis Word (1.5&Prime; binding)</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={exportActions.onPdf}>
          <span style={ITEM_STYLE}><FileText style={ICON_STYLE} /> Defense-Ready PDF</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportActions.onHtml}>
          <span style={ITEM_STYLE}><FileCode style={ICON_STYLE} /> HTML Document</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportActions.onPrint}>
          <span style={ITEM_STYLE}><Printer style={ICON_STYLE} /> Print / PDF</span>
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
