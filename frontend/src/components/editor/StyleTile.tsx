import type { Editor } from '@tiptap/react'

/** Preview typography rendered on a style tile. */
export interface StyleTilePreview {
  fontSize?: string
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
}

export interface StyleGalleryItem {
  format: string
  /** Which current block makes this tile active (see `getCurrentStyleKey`). */
  styleKey: string
  label: string
  /** Tooltip: what the style is for in an academic document. */
  hint: string
  preview: StyleTilePreview
}

/**
 * Word-style gallery, in Word's order. The sample sizes are visual cues only;
 * what a style applies comes from applyStyleCommand (and the active preset).
 */
export const STYLE_GALLERY: StyleGalleryItem[] = [
  { format: 'normal',     styleKey: 'p',          label: 'Normal',    hint: 'Normal — body text',                       preview: { fontSize: '12px', fontWeight: 400 } },
  { format: 'title',      styleKey: 'title',      label: 'Title',     hint: 'Title — the centered document title',      preview: { fontSize: '15px', fontWeight: 700 } },
  { format: 'h1',         styleKey: 'h1',         label: 'Heading 1', hint: 'Heading 1 — chapter heading',              preview: { fontSize: '14px', fontWeight: 700 } },
  { format: 'h2',         styleKey: 'h2',         label: 'Heading 2', hint: 'Heading 2 — section heading',              preview: { fontSize: '13px', fontWeight: 700 } },
  { format: 'h3',         styleKey: 'h3',         label: 'Heading 3', hint: 'Heading 3 — subsection heading',           preview: { fontSize: '12px', fontWeight: 600, fontStyle: 'italic' } },
  { format: 'blockquote', styleKey: 'blockquote', label: 'Quote',     hint: 'Quote — indented quotation',               preview: { fontSize: '11px', fontStyle: 'italic' } },
  { format: 'caption',    styleKey: 'caption',    label: 'Caption',   hint: 'Caption — centered italic figure caption', preview: { fontSize: '11px', fontStyle: 'italic' } },
]

/** The block tag at the caret: h1–h3, blockquote, pre, or p. */
export function getCurrentBlockTag(editor: Editor | null): string {
  if (!editor) return 'p'
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('blockquote')) return 'blockquote'
  if (editor.isActive('codeBlock')) return 'pre'
  return 'p'
}

/** Which gallery style the caret's block has: the title and captions are told apart from Heading 1 and Normal. */
export function getCurrentStyleKey(editor: Editor | null): string {
  if (!editor) return 'p'
  if (editor.isActive('heading') && editor.getAttributes('heading').docRole === 'title') return 'title'
  if (editor.isActive('paragraph') && editor.getAttributes('paragraph').captionKind) return 'caption'
  return getCurrentBlockTag(editor)
}

/** One gallery tile: an "AaBbCc" sample in the style's look above its name, as in Word. */
export function StyleTile({
  item,
  active,
  disabled,
  wide = false,
  label,
  onApply,
}: {
  item: StyleGalleryItem
  active: boolean
  disabled: boolean
  /** Full-width row inside the "More styles" popover. */
  wide?: boolean
  /** Overrides the item's label (custom style aliases). */
  label?: string
  onApply: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={item.hint}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onApply}
      style={{
        display: 'flex',
        flexDirection: wide ? 'row' : 'column',
        alignItems: wide ? 'center' : 'flex-start',
        justifyContent: wide ? 'space-between' : 'center',
        gap: wide ? '12px' : '1px',
        width: wide ? '100%' : 'var(--style-tile-w, 72px)',
        height: wide ? '34px' : '36px',
        padding: wide ? '0 10px' : '2px 7px',
        borderRadius: '6px',
        border: active ? '1px solid var(--accent-strong)' : '1px solid var(--border)',
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--card)',
        color: 'var(--foreground)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: item.preview.fontSize ?? '12px',
          fontWeight: item.preview.fontWeight ?? 400,
          fontStyle: item.preview.fontStyle ?? 'normal',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}
      >
        AaBbCc
      </span>
      <span style={{ fontSize: '9.5px', lineHeight: 1.1, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
        {label ?? item.label}
      </span>
    </button>
  )
}
