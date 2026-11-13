import { useCallback, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { EditorState } from '@tiptap/pm/state'
import { NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { AlignCenter, AlignLeft, AlignRight, Merge, PaintBucket, Scissors as SplitSquare, Trash2 } from 'lucide-react'
import { snapshotTableShape, type BehaviorEventPayload } from './behaviorListener'
import { CELL_FILL_COLORS, setCellFill, setCellTextAlign } from './tableCellCommands'

/** Above the table's top-left corner, so it never covers the cell being typed in. */
const TABLE_MENU_OPTIONS = { placement: 'top-start', offset: 8, flip: true, shift: true } as const

/** Show while the cursor (or a cell selection) is inside a table; not over a text or image selection. */
function tableMenuShouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
  if (!editor.isEditable || !editor.isActive('table')) return false
  const { selection } = state
  if (selection instanceof NodeSelection) return false
  return selection.empty || selection instanceof CellSelection
}

/** The DOM element of the table that holds the selection, for anchoring the menu. */
function selectedTableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    // By name: table-plus's row groups also claim the 'table' role, and the menu belongs above the whole table.
    if ($from.node(depth).type.name === 'table') {
      const dom = editor.view.nodeDOM($from.before(depth))
      return dom instanceof HTMLElement ? dom : null
    }
  }
  return null
}

/**
 * Floating table toolbar shown while the cursor is in a table: rows, columns, merge/split, cell
 * fill and alignment, delete. Mirrors the ribbon's table menu and reports the same behaviour
 * events, so the formatting learner sees the same actions whichever menu was used.
 */
export default function TableBubbleMenu({
  editor,
  onFormatApplied,
}: {
  editor: Editor | null
  onFormatApplied?: (action: string, payload?: BehaviorEventPayload) => void
}): JSX.Element | null {
  const [fillOpen, setFillOpen] = useState(false)
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber })
  // Stable across renders: BubbleMenu re-registers its plugin (one transaction) whenever this
  // changes, and this component re-renders on every transaction, so an inline function looped.
  const anchor = useCallback((): { getBoundingClientRect: () => DOMRect } | null => {
    const table = editor ? selectedTableElement(editor) : null
    return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null
  }, [editor])

  if (!editor) return null

  /** Run a table command and report it like the ribbon does. */
  function act(action: string | null, command: () => boolean): void {
    if (!editor) return
    const ok = command()
    if (ok && action) {
      const shape = snapshotTableShape(editor)
      onFormatApplied?.(action, shape ? { contextNode: 'table', ...shape } : undefined)
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      options={TABLE_MENU_OPTIONS}
      shouldShow={tableMenuShouldShow}
      getReferencedVirtualElement={anchor}
    >
      <div
        role="toolbar"
        aria-label="Table options"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '2px',
          padding: '4px',
          borderRadius: '8px',
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.12) 0px 4px 12px',
          backdropFilter: 'blur(8px)',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        <Label>Row</Label>
        <Button title="Insert row above" onClick={() => act('table_row_add_before', () => editor.chain().focus().addRowBefore().run())}>+ Above</Button>
        <Button title="Insert row below" onClick={() => act('table_row_add_after', () => editor.chain().focus().addRowAfter().run())}>+ Below</Button>
        <Button title="Delete row" danger onClick={() => act('table_row_delete', () => editor.chain().focus().deleteRow().run())}>Delete</Button>
        <Divider />
        <Label>Column</Label>
        <Button title="Insert column left" onClick={() => act('table_col_add_before', () => editor.chain().focus().addColumnBefore().run())}>+ Left</Button>
        <Button title="Insert column right" onClick={() => act('table_col_add_after', () => editor.chain().focus().addColumnAfter().run())}>+ Right</Button>
        <Button title="Delete column" danger onClick={() => act('table_col_delete', () => editor.chain().focus().deleteColumn().run())}>Delete</Button>
        <Divider />
        <Button title="Merge selected cells" onClick={() => act('table_merge_cells', () => editor.chain().focus().mergeCells().run())}>
          <Merge style={ICON} />
        </Button>
        <Button title="Split cell" onClick={() => act('table_split_cell', () => editor.chain().focus().splitCell().run())}>
          <SplitSquare style={ICON} />
        </Button>
        <Divider />
        <Button title="Cell fill color" active={fillOpen} onClick={() => setFillOpen((open) => !open)}>
          <PaintBucket style={ICON} />
        </Button>
        <Button title="Align cell text left" onClick={() => act(null, () => setCellTextAlign(editor, 'left'))}>
          <AlignLeft style={ICON} />
        </Button>
        <Button title="Center cell text" onClick={() => act(null, () => setCellTextAlign(editor, 'center'))}>
          <AlignCenter style={ICON} />
        </Button>
        <Button title="Align cell text right" onClick={() => act(null, () => setCellTextAlign(editor, 'right'))}>
          <AlignRight style={ICON} />
        </Button>
        <Divider />
        <Button title="Delete table" danger onClick={() => act(null, () => editor.chain().focus().deleteTable().run())}>
          <Trash2 style={ICON} />
        </Button>

        {fillOpen && (
          <CellFillPicker
            onPick={(color) => {
              setFillOpen(false)
              act(null, () => setCellFill(editor, color))
            }}
          />
        )}
      </div>
    </BubbleMenu>
  )
}

/** Swatch row for cell fill; also used by the ribbon's table menu. */
export function CellFillPicker({ onPick, inline = false }: { onPick: (color: string | null) => void; inline?: boolean }): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Cell fill colors"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '6px',
        borderRadius: '8px',
        backgroundColor: 'var(--card)',
        ...(inline
          ? {}
          : {
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.12) 0px 4px 12px',
            }),
      }}
    >
      <button
        type="button"
        title="No fill"
        aria-label="No fill"
        onMouseDown={(e) => {
          e.preventDefault()
          onPick(null)
        }}
        style={{ ...SWATCH, background: 'linear-gradient(135deg, transparent 45%, var(--destructive) 45% 55%, transparent 55%)' }}
      />
      {CELL_FILL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={`Fill ${color}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(color)
          }}
          style={{ ...SWATCH, backgroundColor: color }}
        />
      ))}
    </div>
  )
}

const ICON = { width: '14px', height: '14px' } as const

const SWATCH = {
  width: '20px',
  height: '20px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  padding: 0,
} as const

function Label({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      style={{
        padding: '0 5px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--muted-foreground)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Divider(): JSX.Element {
  return <span aria-hidden="true" style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />
}

/** Toolbar button; acts on mousedown so the table selection survives the click. */
function Button({
  title,
  active = false,
  danger = false,
  children,
  onClick,
}: {
  title: string
  active?: boolean
  danger?: boolean
  children: ReactNode
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = danger ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'var(--secondary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active ? 'var(--accent-subtle)' : 'transparent'
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '26px',
        padding: '0 7px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
        color: danger ? 'var(--destructive)' : active ? 'var(--accent-strong)' : 'var(--foreground)',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
