import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import { NodeSelection } from '@tiptap/pm/state'
import { AlignCenter, AlignLeft, AlignRight, RotateCcw, Trash2 } from 'lucide-react'
import type { ImageAlignment } from './behaviorListener'

/** Text-wrap modes offered by the floating image toolbar (Word's 7-mode suite). */
export type ImageWrapStyle =
  | 'inline'
  | 'wrap-left'
  | 'wrap-right'
  | 'wrap-both'
  | 'break'
  | 'behind-text'
  | 'in-front'

interface ImageOptionsState {
  wrap: ImageWrapStyle | null
  alignment: ImageAlignment
  widthPx: number | null
  contentWidth: number
}

/** Read the active wrap mode from an image wrapper style string. */
function wrapFromStyle(style: string): ImageWrapStyle | null {
  if (/float:\s*left/i.test(style)) return 'wrap-left'
  if (/float:\s*right/i.test(style)) return 'wrap-right'
  if (/opacity:\s*0?\.\d/i.test(style)) return 'behind-text'
  if (/z-index:\s*30/i.test(style)) return 'in-front'
  if (/clear:\s*both/i.test(style)) return 'break'
  if (/inline-block/i.test(style)) return 'inline'
  if (/display:\s*block/i.test(style)) return 'wrap-both'
  return null
}

/** Read the image's explicit pixel width from its attr or wrapper style. */
function readWidthPx(attrs: Record<string, unknown>, style: string): number | null {
  if (typeof attrs.width === 'number') return attrs.width
  const match = /(?:^|;)\s*width:\s*([\d.]+)px/i.exec(style)
  return match ? Number(match[1]) : null
}

/** Snapshot everything the toolbar needs from the selected image node. */
function readImageOptions(editor: Editor): ImageOptionsState | null {
  const { selection } = editor.state
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'imageResize') return null
  const attrs = selection.node.attrs
  const style = typeof attrs.containerStyle === 'string' ? attrs.containerStyle : ''
  const wrapMode = typeof attrs.wrapMode === 'string' ? (attrs.wrapMode as ImageWrapStyle) : null
  return {
    // The data-wrap-mode tag is authoritative; legacy images fall back to
    // parsing their wrapper style.
    wrap: wrapMode ?? wrapFromStyle(style),
    alignment: (attrs.alignment as ImageAlignment | null) ?? 'center',
    widthPx: readWidthPx(attrs, style),
    contentWidth: editor.view.dom.clientWidth,
  }
}

/**
 * Floating toolbar shown under a selected image: text-wrap modes (inline,
 * wrap left/right, break text), alignment, width presets, and delete. All
 * actions go through editor commands so the node attributes stay the single
 * source of truth.
 */
export default function ImageOptionsToolbar({ editor }: { editor: Editor }): JSX.Element | null {
  const info = useEditorState({
    editor,
    selector: ({ editor: current }) => readImageOptions(current),
    equalityFn: (a, b) =>
      a === b ||
      (a !== null &&
        b !== null &&
        a.wrap === b.wrap &&
        a.alignment === b.alignment &&
        a.widthPx === b.widthPx &&
        Math.abs(a.contentWidth - b.contentWidth) < 1),
  })

  if (!info) return null

  const contentWidth = info.contentWidth > 0 ? info.contentWidth : 640
  const wrapModes: Array<{ mode: ImageWrapStyle; label: string; tooltip: string }> = [
    { mode: 'inline', label: 'Inline', tooltip: 'In line with text' },
    { mode: 'wrap-left', label: 'Wrap Left', tooltip: 'Square left (text wraps right)' },
    { mode: 'wrap-right', label: 'Wrap Right', tooltip: 'Square right (text wraps left)' },
    { mode: 'wrap-both', label: 'Wrap Both', tooltip: 'Text wraps on both sides' },
    { mode: 'break', label: 'Break', tooltip: 'Top and bottom (break text)' },
    { mode: 'behind-text', label: 'Behind', tooltip: 'Behind text (watermark layer)' },
    { mode: 'in-front', label: 'In Front', tooltip: 'In front of text (floating overlay)' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '4px',
        borderRadius: '8px',
        backgroundColor: 'var(--card)',
        color: 'var(--foreground)',
        boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.12) 0px 4px 12px',
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
      }}
    >
      <ToolbarLabel>Wrap</ToolbarLabel>
      {wrapModes.map(({ mode, label, tooltip }) => (
        <ToolbarButton
          key={mode}
          title={`Text wrap: ${tooltip}`}
          active={info.wrap === mode}
          onClick={() => editor.chain().focus().setImageWrapStyle(mode).run()}
        >
          {label}
        </ToolbarButton>
      ))}

      <ToolbarDivider />

      <ToolbarButton
        title="Align left"
        active={info.alignment === 'left'}
        onClick={() => editor.chain().focus().setImageAlignment('left').run()}
      >
        <AlignLeft style={{ width: '14px', height: '14px' }} />
      </ToolbarButton>
      <ToolbarButton
        title="Align center"
        active={info.alignment === 'center'}
        onClick={() => editor.chain().focus().setImageAlignment('center').run()}
      >
        <AlignCenter style={{ width: '14px', height: '14px' }} />
      </ToolbarButton>
      <ToolbarButton
        title="Align right"
        active={info.alignment === 'right'}
        onClick={() => editor.chain().focus().setImageAlignment('right').run()}
      >
        <AlignRight style={{ width: '14px', height: '14px' }} />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarLabel>Width</ToolbarLabel>
      {([25, 50, 75, 100] as const).map((pct) => (
        <ToolbarButton
          key={pct}
          title={`Width ${pct}% of the text column`}
          active={info.widthPx !== null && Math.abs(info.widthPx - (contentWidth * pct) / 100) <= 2}
          onClick={() =>
            editor.chain().focus().setImageWidth(Math.round((contentWidth * pct) / 100)).run()
          }
        >
          {pct}%
        </ToolbarButton>
      ))}
      <ToolbarButton
        title="Reset to natural size"
        onClick={() => editor.chain().focus().setImageWidth(null).run()}
      >
        <RotateCcw style={{ width: '14px', height: '14px' }} />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        title="Delete image"
        danger
        onClick={() => editor.chain().focus().deleteSelection().run()}
      >
        <Trash2 style={{ width: '14px', height: '14px' }} />
      </ToolbarButton>
    </div>
  )
}

/** Uppercase section label inside the toolbar. */
function ToolbarLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
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

/** Thin vertical divider between toolbar groups. */
function ToolbarDivider(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1px',
        height: '16px',
        backgroundColor: 'var(--border)',
        margin: '0 3px',
        flexShrink: 0,
      }}
    />
  )
}

interface ToolbarButtonProps {
  title: string
  active?: boolean
  danger?: boolean
  children: ReactNode
  onClick: () => void
}

/** One action button in the floating image toolbar. */
function ToolbarButton({
  title,
  active = false,
  danger = false,
  children,
  onClick,
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        // Keep the image selection alive when the toolbar button is pressed.
        e.preventDefault()
        onClick()
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = danger
          ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
          : 'var(--secondary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active ? 'var(--accent-subtle)' : 'transparent'
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        height: '26px',
        padding: '0 8px',
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
