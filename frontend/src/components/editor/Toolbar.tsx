import { useState, useEffect, useRef, useCallback } from 'react'
import * as FC from './FormattingCommands'
import {
  isFormatActive,
  restoreSelection,
  getCurrentFontFamily,
  getCurrentFontSize,
  getCurrentBlockTag,
} from './SelectionManager'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Eraser,
  FileText,
  Italic,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Indent,
  Quote,
  Redo,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  onFormatApplied?: (action: string) => void
  onFocusEditor?: () => void
  /** Page size preset; controlled from Document.tsx */
  pageSize: PageSizeKey
  onPageSizeChange: (size: PageSizeKey) => void
  /** Margins in inches; controlled from Document.tsx */
  margins: MarginValues
  onMarginsChange: (m: MarginValues) => void
}

export type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

export interface MarginValues {
  top: number
  bottom: number
  left: number
  right: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  'Times New Roman',
  'Arial',
  'Calibri',
  'Georgia',
  'Courier New',
  'Verdana',
]

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72']

const HEADING_OPTIONS = [
  { label: 'Normal', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
  { label: 'Heading 4', tag: 'h4' },
  { label: 'Heading 5', tag: 'h5' },
  { label: 'Heading 6', tag: 'h6' },
]

const LINE_SPACING_OPTIONS = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0']

export const PAGE_SIZES: Record<PageSizeKey, { label: string; width: number; height: number }> = {
  short:  { label: 'Short Bond (8.5×11)',  width: 816,  height: 1056 },
  long:   { label: 'Long Bond (8.5×13)',   width: 816,  height: 1248 },
  a4:     { label: 'A4 (8.27×11.69)',       width: 794,  height: 1123 },
  letter: { label: 'US Letter (8.5×11)',   width: 816,  height: 1056 },
  legal:  { label: 'Legal (8.5×14)',       width: 816,  height: 1344 },
}

const FONT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#ffffff',
  '#ff0000', '#ff4500', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#0000ff', '#9900ff', '#ff00ff', '#e06666', '#f6b26b', '#ffd966',
  '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3',
]

const HIGHLIGHT_COLORS = [
  'transparent', '#ffff00', '#00ff00', '#00ffff', '#ff00ff',
  '#ff0000', '#0000ff', '#ffa500', '#ffcdd2', '#c8e6c9',
  '#bbdefb', '#e1bee7', '#fff9c4',
]

// ─── Sub-components ─────────────────────────────────────────────────────────

/** A native-styled select dropdown that matches the toolbar aesthetic. */
function ToolSelect({
  value,
  onChange,
  options,
  width = 'auto',
  title,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  width?: number | string
  title?: string
}) {
  return (
    <select
      title={title}
      value={value}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: '28px',
        width,
        padding: '0 4px',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontSize: '0.78rem',
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/** A small color-swatch grid popover for font/highlight color pickers. */
function ColorPicker({
  colors,
  onSelect,
  onClose,
  anchorEl,
}: {
  colors: string[]
  onSelect: (color: string) => void
  onClose: () => void
  anchorEl: HTMLElement | null
}) {
  const rect = anchorEl?.getBoundingClientRect()
  const top = rect ? rect.bottom + 4 : 40
  const left = rect ? Math.min(rect.left, window.innerWidth - 180) : 0

  return (
    <div
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 9999,
        padding: '8px',
        backgroundColor: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '4px',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c === 'transparent' ? 'No highlight' : c}
          onMouseDown={() => { onSelect(c); onClose() }}
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '3px',
            border: c === 'transparent' ? '1px dashed var(--border)' : '1px solid rgba(0,0,0,0.15)',
            backgroundColor: c,
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}
    </div>
  )
}

/** Margins popover with 4 numeric inputs (in inches). */
function MarginsPopover({
  margins,
  onChange,
  onClose,
  anchorEl,
}: {
  margins: MarginValues
  onChange: (m: MarginValues) => void
  onClose: () => void
  anchorEl: HTMLElement | null
}) {
  const rect = anchorEl?.getBoundingClientRect()
  const top = rect ? rect.bottom + 4 : 40
  const left = rect ? Math.min(rect.left, window.innerWidth - 200) : 0

  const fields: { key: keyof MarginValues; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 9999,
        padding: '12px',
        backgroundColor: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        minWidth: '180px',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Margins (inches)
      </p>
      {fields.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--foreground)', minWidth: '52px' }}>{label}</label>
          <input
            type="number"
            min={0.25}
            max={4}
            step={0.25}
            value={margins[key]}
            onChange={(e) => onChange({ ...margins, [key]: parseFloat(e.target.value) || 0.5 })}
            style={{
              width: '64px',
              height: '26px',
              padding: '0 6px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.8rem',
              outline: 'none',
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onMouseDown={onClose}
        style={{
          marginTop: '4px',
          width: '100%',
          height: '26px',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
          fontSize: '0.78rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Done
      </button>
    </div>
  )
}

// ─── Toolbar button ──────────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon,
  label,
  active = false,
  onMouseDown,
}: {
  icon: React.ElementType
  label: string
  active?: boolean
  onMouseDown: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown() }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: active ? 'var(--secondary)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        boxShadow: active ? '0 0 0 1px var(--border)' : 'none',
        cursor: 'pointer',
        transition: 'background-color 120ms, color 120ms',
        outline: 'none',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)'
        }
      }}
    >
      <Icon style={{ width: '14px', height: '14px' }} />
    </button>
  )
}

/** Thin vertical separator between toolbar groups. */
function Sep() {
  return (
    <div style={{
      width: '1px',
      height: '20px',
      backgroundColor: 'var(--border)',
      margin: '0 4px',
      flexShrink: 0,
      opacity: 0.7,
    }} />
  )
}

// ─── Main Toolbar ────────────────────────────────────────────────────────────

/** Full MS Word / Google Docs-style editor toolbar.
 *  Controlled props: pageSize, onPageSizeChange, margins, onMarginsChange
 *  are lifted to Document.tsx so page dimensions update without editor re-mount. */
export function Toolbar({
  onFormatApplied,
  onFocusEditor,
  pageSize,
  onPageSizeChange,
  margins,
  onMarginsChange,
}: ToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [fontFamily, setFontFamily] = useState('Times New Roman')
  const [fontSize, setFontSizeState] = useState('11')
  const [blockTag, setBlockTag] = useState('p')
  const [lineSpacing, setLineSpacing] = useState('1.5')
  const [fontColorActive, setFontColorActive] = useState('#000000')

  const [showFontColor, setShowFontColor] = useState(false)
  const [showHighlight, setShowHighlight] = useState(false)
  const [showMargins, setShowMargins] = useState(false)

  const fontColorRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const marginsRef = useRef<HTMLDivElement>(null)

  /** Poll the cursor state every selectionchange to keep toolbar in sync. */
  const updateState = useCallback(() => {
    const formats = new Set<string>()
    const toggleable = [
      'bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript',
      'blockquote', 'unordered_list', 'ordered_list',
      'align-left', 'align-center', 'align-right', 'align-justify',
    ]
    toggleable.forEach(f => { if (isFormatActive(f)) formats.add(f) })
    setActiveFormats(formats)

    const ff = getCurrentFontFamily()
    if (ff) setFontFamily(ff.replace(/^["']|["']$/g, ''))

    const fs = getCurrentFontSize()
    if (fs) {
      // Convert "14.6667px" → nearest pt (1pt = 1.3333px)
      const pxMatch = fs.match(/([\d.]+)px/)
      if (pxMatch) {
        const pt = Math.round(parseFloat(pxMatch[1]) * 72 / 96)
        setFontSizeState(String(pt))
      }
    }

    setBlockTag(getCurrentBlockTag() || 'p')
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', updateState)
    return () => document.removeEventListener('selectionchange', updateState)
  }, [updateState])

  // Close popovers when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (fontColorRef.current && !fontColorRef.current.contains(e.target as Node)) setShowFontColor(false)
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) setShowHighlight(false)
      if (marginsRef.current && !marginsRef.current.contains(e.target as Node)) setShowMargins(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  /** Focus the editor, restore selection, run a command, fire the behavior event. */
  function run(action: string, command: () => void) {
    onFocusEditor?.()
    restoreSelection()
    command()
    onFormatApplied?.(action)
    setTimeout(updateState, 30)
  }

  const active = (f: string) => activeFormats.has(f)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        flexWrap: 'wrap',
        padding: '4px 8px',
        minHeight: '40px',
        userSelect: 'none',
      }}
    >
      {/* ── Undo / Redo ──────────────────────────────────── */}
      <ToolBtn icon={Undo}  label="Undo" onMouseDown={() => run('undo', FC.undo)} />
      <ToolBtn icon={Redo}  label="Redo" onMouseDown={() => run('redo', FC.redo)} />
      <Sep />

      {/* ── Font family ──────────────────────────────────── */}
      <ToolSelect
        title="Font family"
        value={fontFamily}
        width={148}
        onChange={(v) => {
          setFontFamily(v)
          run('font_family', () => FC.fontFamily(v))
        }}
        options={FONT_FAMILIES.map(f => ({ value: f, label: f }))}
      />

      {/* ── Font size ────────────────────────────────────── */}
      <ToolSelect
        title="Font size (pt)"
        value={fontSize}
        width={56}
        onChange={(v) => {
          setFontSizeState(v)
          run('font_size', () => FC.fontSize(`${v}pt`))
        }}
        options={FONT_SIZES.map(s => ({ value: s, label: s }))}
      />
      <Sep />

      {/* ── Bold / Italic / Underline / Strike ───────────── */}
      <ToolBtn icon={Bold}          label="Bold"          active={active('bold')}          onMouseDown={() => run('bold', FC.bold)} />
      <ToolBtn icon={Italic}        label="Italic"        active={active('italic')}        onMouseDown={() => run('italic', FC.italic)} />
      <ToolBtn icon={Underline}     label="Underline"     active={active('underline')}     onMouseDown={() => run('underline', FC.underline)} />
      <ToolBtn icon={Strikethrough} label="Strikethrough" active={active('strikethrough')} onMouseDown={() => run('strikethrough', FC.strikethrough)} />
      <Sep />

      {/* ── Superscript / Subscript ───────────────────────── */}
      <ToolBtn icon={Superscript} label="Superscript" active={active('superscript')} onMouseDown={() => run('superscript', FC.superscript)} />
      <ToolBtn icon={Subscript}   label="Subscript"   active={active('subscript')}   onMouseDown={() => run('subscript', FC.subscript)} />
      <Sep />

      {/* ── Font color ───────────────────────────────────── */}
      <div ref={fontColorRef} style={{ position: 'relative' }}>
        <button
          type="button"
          title="Text color"
          onMouseDown={(e) => { e.preventDefault(); setShowFontColor(v => !v); setShowHighlight(false); setShowMargins(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '2px', height: '28px',
            padding: '0 4px', borderRadius: '4px', border: 'none',
            backgroundColor: 'transparent', color: 'var(--muted-foreground)',
            cursor: 'pointer', transition: 'background-color 120ms',
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, borderBottom: `3px solid ${fontColorActive}`, paddingBottom: '1px', color: 'var(--foreground)' }}>A</span>
          <ChevronDown style={{ width: '10px', height: '10px' }} />
        </button>
        {showFontColor && (
          <ColorPicker
            anchorEl={fontColorRef.current}
            colors={FONT_COLORS}
            onSelect={(c) => { setFontColorActive(c); run('font_color', () => FC.fontColor(c)) }}
            onClose={() => setShowFontColor(false)}
          />
        )}
      </div>

      {/* ── Highlight color ───────────────────────────────── */}
      <div ref={highlightRef} style={{ position: 'relative' }}>
        <button
          type="button"
          title="Highlight color"
          onMouseDown={(e) => { e.preventDefault(); setShowHighlight(v => !v); setShowFontColor(false); setShowMargins(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '2px', height: '28px',
            padding: '0 4px', borderRadius: '4px', border: 'none',
            backgroundColor: 'transparent', color: 'var(--muted-foreground)',
            cursor: 'pointer', transition: 'background-color 120ms',
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#ffff00', padding: '0 3px', borderRadius: '2px', color: '#000' }}>H</span>
          <ChevronDown style={{ width: '10px', height: '10px' }} />
        </button>
        {showHighlight && (
          <ColorPicker
            anchorEl={highlightRef.current}
            colors={HIGHLIGHT_COLORS}
            onSelect={(c) => run('highlight', () => FC.highlightColor(c))}
            onClose={() => setShowHighlight(false)}
          />
        )}
      </div>
      <Sep />

      {/* ── Heading dropdown ─────────────────────────────── */}
      <ToolSelect
        title="Paragraph style"
        value={blockTag}
        width={112}
        onChange={(v) => {
          setBlockTag(v)
          run(`heading_${v}`, () => FC.applyBlockFormat(v))
        }}
        options={HEADING_OPTIONS.map(h => ({ value: h.tag, label: h.label }))}
      />
      <Sep />

      {/* ── Alignment ────────────────────────────────────── */}
      <ToolBtn icon={AlignLeft}    label="Align left"    active={active('align-left')}    onMouseDown={() => run('align_left',    FC.alignLeft)} />
      <ToolBtn icon={AlignCenter}  label="Align center"  active={active('align-center')}  onMouseDown={() => run('align_center',  FC.alignCenter)} />
      <ToolBtn icon={AlignRight}   label="Align right"   active={active('align-right')}   onMouseDown={() => run('align_right',   FC.alignRight)} />
      <ToolBtn icon={AlignJustify} label="Justify"       active={active('align-justify')} onMouseDown={() => run('align_justify', FC.alignJustify)} />
      <Sep />

      {/* ── Lists ────────────────────────────────────────── */}
      <ToolBtn icon={List}        label="Bullet list"   active={active('unordered_list')} onMouseDown={() => run('unordered_list', FC.bulletList)} />
      <ToolBtn icon={ListOrdered} label="Numbered list" active={active('ordered_list')}   onMouseDown={() => run('ordered_list',   FC.numberedList)} />
      <ToolBtn icon={Outdent}     label="Outdent"                                          onMouseDown={() => run('outdent',        FC.outdent)} />
      <ToolBtn icon={Indent}      label="Indent"                                           onMouseDown={() => run('indent',         FC.indent)} />
      <Sep />

      {/* ── Insert ───────────────────────────────────────── */}
      <ToolBtn icon={Quote}  label="Blockquote"    active={active('blockquote')} onMouseDown={() => run('blockquote',      FC.blockquote)} />
      <ToolBtn icon={Minus}  label="Horizontal rule"                             onMouseDown={() => run('horizontal_rule', FC.horizontalRule)} />
      <ToolBtn icon={Eraser} label="Clear formatting"                            onMouseDown={() => run('clear_formatting', FC.clearFormatting)} />
      <Sep />

      {/* ── Line spacing ─────────────────────────────────── */}
      <ToolSelect
        title="Line spacing"
        value={lineSpacing}
        width={68}
        onChange={(v) => {
          setLineSpacing(v)
          run('line_spacing', () => FC.lineSpacing(v))
        }}
        options={LINE_SPACING_OPTIONS.map(s => ({ value: s, label: `≡ ${s}` }))}
      />
      <Sep />

      {/* ── Page size ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <FileText style={{ width: '13px', height: '13px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <ToolSelect
          title="Page size"
          value={pageSize}
          width={148}
          onChange={(v) => onPageSizeChange(v as PageSizeKey)}
          options={Object.entries(PAGE_SIZES).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </div>

      {/* ── Margins ──────────────────────────────────────── */}
      <div ref={marginsRef} style={{ position: 'relative' }}>
        <button
          type="button"
          title="Page margins"
          onMouseDown={(e) => { e.preventDefault(); setShowMargins(v => !v); setShowFontColor(false); setShowHighlight(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '3px', height: '28px',
            padding: '0 7px', borderRadius: '4px', border: '1px solid var(--border)',
            backgroundColor: showMargins ? 'var(--secondary)' : 'transparent',
            color: 'var(--foreground)', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit',
            transition: 'background-color 120ms',
          }}
        >
          Margins
          <ChevronDown style={{ width: '10px', height: '10px' }} />
        </button>
        {showMargins && (
          <MarginsPopover
            anchorEl={marginsRef.current}
            margins={margins}
            onChange={onMarginsChange}
            onClose={() => setShowMargins(false)}
          />
        )}
      </div>
    </div>
  )
}
