import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import type { EditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import TextAlign from '@tiptap/extension-text-align'
import ImageResize from 'tiptap-extension-resize-image'
import Paragraph from '@tiptap/extension-paragraph'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Highlight from '@tiptap/extension-highlight'
import { GrammarUnderlineExtension } from './GrammarUnderlineExtension'
import { PageBreak } from './PageBreak'
import {
  Undo2,
  Redo2,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code2,
  ChevronDown,
  Plus,
  Minus,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  Palette,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Table as TableIcon,
  Image as ImageIcon,
  FileUp,
  Minus as HRLine,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Sparkles,
  Download,
  FileText,
  Printer,
  FileCode,
} from 'lucide-react'
import { api, type PageNumberFormat } from '@/services/api'
import { FontSizeExtension } from './FontSizeExtension'
import { IndentExtension } from './IndentExtension'
import { TargetHighlightExtension } from './TargetHighlightExtension'

/** Download document content as a standalone clean HTML file. */
function downloadHTML(html: string, title: string): void {
  const docTitle = title.trim() || 'Untitled Document'
  const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    body {
      max-width: 800px;
      margin: 40px auto;
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      padding: 0 20px;
      color: #111;
    }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; }
    blockquote { border-left: 3px solid #ccc; padding-left: 12px; margin: 12px 0; color: #555; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${docTitle}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Download document content as a Word-compatible document (.doc). */
function downloadDOCX(html: string, title: string): void {
  const docTitle = title.trim() || 'Untitled Document'
  const content = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${docTitle}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
    h1 { font-size: 18pt; font-weight: bold; }
    h2 { font-size: 14pt; font-weight: bold; }
    h3 { font-size: 12pt; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px; }
    blockquote { border-left: 3px solid #999; padding-left: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`
  const blob = new Blob(['\ufeff', content], {
    type: 'application/msword;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${docTitle}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Open print preview to print or Save as PDF. */
function printDocument(): void {
  window.print()
}

// ─── Public types (kept for Document.tsx page layout) ───────────────────────

export type PageSizeKey = 'short' | 'long' | 'a4' | 'letter' | 'legal'

export type PageOrientation = 'portrait' | 'landscape'

export interface MarginValues {
  top: number
  bottom: number
  left: number
  right: number
}

export const PAGE_SIZES: Record<PageSizeKey, { label: string; width: number; height: number }> = {
  short:  { label: 'Short (8.5×11")',  width: 816,  height: 1056 },
  long:   { label: 'Long (8.5×13")',   width: 816,  height: 1248 },
  a4:     { label: 'A4 (8.27×11.69")', width: 794,  height: 1123 },
  letter: { label: 'Letter (8.5×11")', width: 816,  height: 1056 },
  legal:  { label: 'Legal (8.5×14")',  width: 816,  height: 1344 },
}

// ─── Vercel-style design tokens (per DESIGN.md) ─────────────────────────────

const SHADOW_BORDER: CSSProperties = { boxShadow: '0px 0px 0px 1px var(--border-shadow)' }
const SHADOW_CARD: CSSProperties = {
  boxShadow:
    'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 2px 2px, rgba(0, 0, 0, 0.04) 0px 8px 8px -8px, var(--card-shadow-inner) 0px 0px 0px 1px',
}

const GROUP_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '2px',
  borderRadius: '8px',
  ...SHADOW_BORDER,
}

const POPOVER_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  marginTop: '6px',
  zIndex: 60,
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  borderRadius: '8px',
  ...SHADOW_CARD,
  animation: 'fadeIn 150ms ease',
}

const FOCUS_RING: CSSProperties = { outline: '2px solid var(--ring)', outlineOffset: '1px' }

// ─── Whitelist of CSS properties allowed through inline style pass-through ──

const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'background', 'text-align',
  'font-weight', 'font-style', 'font-size', 'font-family',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-color', 'border-width', 'border-style',
  'vertical-align', 'line-height', 'text-decoration',
  'white-space', 'word-wrap', 'overflow-wrap',
])

/** Extract only whitelisted CSS properties from an inline style string. */
function filterStyle(raw: string | null): string | null {
  if (!raw) return null
  const kept: string[] = []
  for (const decl of raw.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon < 1) continue
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    if (ALLOWED_STYLE_PROPS.has(prop)) kept.push(trimmed)
  }
  return kept.length > 0 ? kept.join('; ') : null
}

// ─── Custom node extensions preserving imported styles and cell backgrounds ─

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('color'),
        renderHTML: (a) => (a.color ? { color: a.color } : {}),
      },
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('bgcolor'),
        renderHTML: (a) => (a.backgroundColor ? { bgcolor: a.backgroundColor } : {}),
      },
      style: {
        default: null,
        parseHTML: (el) => filterStyle(el.getAttribute('style')),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
    }
  },
})

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('color'),
        renderHTML: (a) => (a.color ? { color: a.color } : {}),
      },
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('bgcolor'),
        renderHTML: (a) => (a.backgroundColor ? { bgcolor: a.backgroundColor } : {}),
      },
      style: {
        default: null,
        parseHTML: (el) => filterStyle(el.getAttribute('style')),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
    }
  },
})

// ─── Editor extensions (single source of truth) ─────────────────────────────

const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el) => filterStyle(el.getAttribute('style')),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
    }
  },
})

/** Center-aligned ImageResize: sets containerStyle to center by default. */
const CenteredImageResize = ImageResize.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      containerStyle: {
        default: 'margin: 0 auto;',
        parseHTML: (element) => {
          const raw = element.getAttribute('containerstyle')
          if (raw) return raw
          const width = element.getAttribute('width')
          if (width) return `width: ${width}px; height: auto; cursor: pointer; margin: 0 auto;`
          return 'margin: 0 auto;'
        },
        renderHTML: (attributes) => {
          if (!attributes.containerStyle) return {}
          return { containerstyle: attributes.containerStyle }
        },
      },
    }
  },
})

export const editorExtensions = [
  StarterKit.configure({
    paragraph: false,
  }),
  CustomParagraph,
  PageBreak,
  TextStyle,
  Color,
  FontFamily,
  FontSizeExtension,
  IndentExtension,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  CenteredImageResize.configure({ inline: false, allowBase64: true }),
  Table.configure({ resizable: true }),
  TableRow,
  CustomTableCell,
  CustomTableHeader,
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  GrammarUnderlineExtension,
  TargetHighlightExtension,
]

// ─── Editor factory hook ────────────────────────────────────────────────────

/**
 * Create a TipTap editor wired to the shared extension set.
 * `onUpdate` receives the serialized HTML on every content change.
 * A ref keeps the callback current without recreating the editor.
 */
export function useTiptapEditor(onUpdate: (html: string) => void): Editor | null {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  return useEditor({
    extensions: editorExtensions,
    content: '',
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => onUpdateRef.current(editor.getHTML()),
  })
}

// ─── Menu show/hide predicates (module-level, stable identity) ──────────────

const BUBBLE_MENU_OPTIONS = { placement: 'top' } as const
const FLOATING_MENU_OPTIONS = { placement: 'bottom-start' } as const

/** Show the bubble menu only when a non-empty text range is selected. */
function bubbleMenuShouldShow(props: {
  editor: Editor
  state: EditorState
  from: number
  to: number
}): boolean {
  const { editor, state, from, to } = props
  if (from === to) return false
  return editor.isFocused && state.doc.textBetween(from, to, ' ').trim().length > 0
}

/** Show the floating menu only when the selection is an empty, focused paragraph. */
function floatingMenuShouldShow(props: { editor: Editor; state: EditorState }): boolean {
  const { editor, state } = props
  const { empty } = state.selection
  if (!empty || !editor.isFocused) return false
  const parent = state.selection.$anchor.parent
  return parent.type.name === 'paragraph' && parent.textContent.length === 0
}

// ─── Shared UI primitives (Vercel styling) ──────────────────────────────────

/** Compact 28px toolbar button with active/hover/focus states. */
function ToolButton({
  icon: Icon,
  title,
  active = false,
  disabled = false,
  onClick,
  indicatorColor,
}: {
  icon: typeof Bold
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  indicatorColor?: string
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, FOCUS_RING)}
      onBlur={(e) => e.currentTarget.style.outline = 'none'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: active ? 'var(--primary)' : 'transparent',
        color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background-color 150ms, color 150ms',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.backgroundColor = 'var(--secondary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <Icon style={{ width: '14px', height: '14px' }} strokeWidth={active ? 2.25 : 1.75} />
      {indicatorColor && indicatorColor !== 'transparent' && (
        <span
          style={{
            position: 'absolute',
            bottom: '3px',
            width: '12px',
            height: '2px',
            borderRadius: '9999px',
            backgroundColor: indicatorColor,
          }}
        />
      )}
    </button>
  )
}

/** Thin vertical divider between toolbar groups. */
function Divider(): JSX.Element {
  return (
    <div
      style={{
        width: '1px',
        height: '18px',
        backgroundColor: 'var(--border)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )
}

/** Vercel-style popover wrapper with fade-in entrance. */
function Popover({
  children,
  width = 220,
  rightAligned = false,
}: {
  children: ReactNode
  width?: number
  rightAligned?: boolean
}): JSX.Element {
  return (
    <div
      style={{
        ...POPOVER_STYLE,
        width,
        padding: '6px',
        ...(rightAligned ? { right: 0, left: 'auto' } : {}),
      }}
    >
      {children}
    </div>
  )
}

/** Popover row item (button) shared by dropdowns. */
function MenuItem({
  active = false,
  onClick,
  children,
  style,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  style?: CSSProperties
}): JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        width: '100%',
        padding: '6px 8px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: active ? 'var(--primary)' : 'transparent',
        color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
        fontSize: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background-color 150ms',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'var(--secondary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

// ─── Constants for the toolbar dropdowns ────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: 'Times New Roman', fontStyle: "'Times New Roman', Times, serif" },
  { label: 'Inter',           value: 'Inter',           fontStyle: "'Inter', sans-serif" },
  { label: 'Geist Sans',      value: 'Geist',           fontStyle: "'Geist', sans-serif" },
  { label: 'Roboto',         value: 'Roboto',          fontStyle: "'Roboto', sans-serif" },
  { label: 'Outfit',         value: 'Outfit',          fontStyle: "'Outfit', sans-serif" },
  { label: 'Lora',           value: 'Lora',            fontStyle: "'Lora', serif" },
  { label: 'Merriweather',   value: 'Merriweather',    fontStyle: "'Merriweather', serif" },
  { label: 'Arial',          value: 'Arial',           fontStyle: 'Arial, sans-serif' },
  { label: 'Georgia',        value: 'Georgia',         fontStyle: 'Georgia, serif' },
  { label: 'Courier New',    value: 'Courier New',     fontStyle: "'Courier New', monospace" },
  { label: 'JetBrains Mono', value: 'JetBrains Mono',  fontStyle: "'JetBrains Mono', monospace" },
]

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48]

const BLOCK_STYLES = [
  { label: 'Paragraph',   tag: 'p',          icon: Type,     shortcut: 'Ctrl+Alt+0' },
  { label: 'Heading 1',   tag: 'h1',         icon: Heading1, shortcut: 'Ctrl+Alt+1' },
  { label: 'Heading 2',   tag: 'h2',         icon: Heading2, shortcut: 'Ctrl+Alt+2' },
  { label: 'Heading 3',   tag: 'h3',         icon: Heading3, shortcut: 'Ctrl+Alt+3' },
  { label: 'Blockquote',  tag: 'blockquote', icon: Quote,    shortcut: 'Ctrl+Shift+B' },
  { label: 'Code Block',  tag: 'pre',        icon: Code2,    shortcut: 'Ctrl+Alt+C' },
]

const PRESET_COLORS = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#ffffff',
  '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0284c7',
  '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#e11d48',
]

const PRESET_HIGHLIGHTS = [
  'transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe',
]

// ─── Toolbar component ──────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor | null
  onFormatApplied?: (action: string) => void
  pageSize: PageSizeKey
  onPageSizeChange: (size: PageSizeKey) => void
  margins: MarginValues
  onMarginsChange: (m: MarginValues) => void
  orientation: PageOrientation
  onOrientationChange: (value: PageOrientation) => void
  onImportComplete?: (
    htmlContent: string,
    title?: string,
    layout?: {
      pageSize?: PageSizeKey
      margins?: MarginValues
      orientation?: PageOrientation
      headerContent?: string
      footerContent?: string
    }
  ) => void
  headerContent: string
  footerContent: string
  onHeaderChange: (value: string) => void
  onFooterChange: (value: string) => void
  showHeader: boolean
  showFooter: boolean
  onShowHeaderChange: (value: boolean) => void
  onShowFooterChange: (value: boolean) => void
  headerNumberFormat: PageNumberFormat
  footerNumberFormat: PageNumberFormat
  onHeaderNumberFormatChange: (value: PageNumberFormat) => void
  onFooterNumberFormatChange: (value: PageNumberFormat) => void
  documentTitle?: string
}

/**
 * Vercel-styled formatting toolbar. Every control drives TipTap through
 * `editor.chain().focus().<command>().run()` — no DOM editing here.
 */
export function TiptapToolbar({
  editor,
  onFormatApplied,
  pageSize,
  onPageSizeChange,
  margins,
  onMarginsChange,
  orientation,
  onOrientationChange,
  onImportComplete,
  headerContent,
  footerContent,
  onHeaderChange,
  onFooterChange,
  showHeader,
  showFooter,
  onShowHeaderChange,
  onShowFooterChange,
  headerNumberFormat,
  footerNumberFormat,
  onHeaderNumberFormatChange,
  onFooterNumberFormatChange,
  documentTitle = 'Untitled Document',
}: ToolbarProps): JSX.Element {
  const [openStyle, setOpenStyle] = useState(false)
  const [openFont, setOpenFont] = useState(false)
  const [openSize, setOpenSize] = useState(false)
  const [openColor, setOpenColor] = useState(false)
  const [openHighlight, setOpenHighlight] = useState(false)
  const [openTableMenu, setOpenTableMenu] = useState(false)
  const [openPageSetup, setOpenPageSetup] = useState(false)
  const [openExport, setOpenExport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Re-render on every TipTap transaction so active/disabled states stay fresh.
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  // Close all popovers when clicking outside the toolbar.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        closeAllMenus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function closeAllMenus(): void {
    setOpenStyle(false)
    setOpenFont(false)
    setOpenSize(false)
    setOpenColor(false)
    setOpenHighlight(false)
    setOpenTableMenu(false)
    setOpenPageSetup(false)
    setOpenExport(false)
  }

  /** Run a TipTap command and report the action for behavior tracking. */
  function run(actionName: string, command: () => void): void {
    command()
    onFormatApplied?.(actionName)
  }

  const isActive = (mark: string | Record<string, unknown>): boolean =>
    editor ? editor.isActive(mark) : false

  const currentBlockTag = (() => {
    if (!editor) return 'p'
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    if (editor.isActive('blockquote')) return 'blockquote'
    if (editor.isActive('codeBlock')) return 'pre'
    return 'p'
  })()

  const activeBlockLabel =
    BLOCK_STYLES.find((b) => b.tag === currentBlockTag)?.label || 'Paragraph'

  const currentFontFamily = (() => {
    if (!editor) return 'Times New Roman'
    const ff = editor.getAttributes('textStyle').fontFamily as string | undefined
    return ff ? ff.replace(/^["']|["']$/g, '') : 'Times New Roman'
  })()

  const currentFontSize = (() => {
    if (!editor) return 11
    const fs = editor.getAttributes('textStyle').fontSize as string | undefined
    if (!fs) return 11
    const ptMatch = fs.match(/([\d.]+)pt/)
    if (ptMatch) return Math.round(parseFloat(ptMatch[1]))
    const pxMatch = fs.match(/([\d.]+)px/)
    if (pxMatch) return Math.round((parseFloat(pxMatch[1]) * 72) / 96)
    return 11
  })()

  const currentColor =
    (editor?.getAttributes('textStyle').color as string | undefined) || '#000000'
  const currentHighlight =
    (editor?.getAttributes('highlight').color as string | undefined) || 'transparent'

  /** Upload a document (.docx/.pdf/.txt/.html) via the backend, then inject HTML. */
  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const importedDoc = await api.documents.import(file)
      if (importedDoc?.content && editor) {
        editor.commands.setContent(importedDoc.content, { emitUpdate: true })
        onImportComplete?.(importedDoc.content, importedDoc.title, {
          pageSize: importedDoc.page_size,
          margins: importedDoc.margins,
          orientation: importedDoc.orientation,
          headerContent: importedDoc.header_content,
          footerContent: importedDoc.footer_content,
        })
      }
    } catch (error) {
      console.error('File import failed:', error)
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        if (result && editor) {
          if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            editor.commands.setContent(result, { emitUpdate: true })
          } else {
            editor.commands.setContent(
              `<p>${result.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`,
              { emitUpdate: true }
            )
          }
          onImportComplete?.(editor.getHTML(), file.name.replace(/\.[^/.]+$/, ''))
        }
      }
      reader.readAsText(file)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '6px 12px',
        minHeight: '44px',
        backgroundColor: 'color-mix(in srgb, var(--card) 85%, transparent)',
        backdropFilter: 'blur(12px)',
        zIndex: 50,
        fontSize: '13px',
        userSelect: 'none',
        ...SHADOW_BORDER,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.doc,.pdf,.txt,.html,.htm"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileSelected(e)}
      />

      {/* History */}
      <div style={GROUP_STYLE}>
        <ToolButton
          icon={Undo2}
          title="Undo (Ctrl+Z)"
          disabled={!editor?.can().undo()}
          onClick={() => run('undo', () => editor?.chain().focus().undo().run())}
        />
        <ToolButton
          icon={Redo2}
          title="Redo (Ctrl+Y)"
          disabled={!editor?.can().redo()}
          onClick={() => run('redo', () => editor?.chain().focus().redo().run())}
        />
      </div>

      <Divider />

      {/* Block style dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            const next = !openStyle
            closeAllMenus()
            setOpenStyle(next)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 10px',
            borderRadius: '6px',
            border: 'none',
            ...SHADOW_BORDER,
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Sparkles style={{ width: '14px', height: '14px', color: 'var(--foreground)', opacity: 0.7 }} />
          <span>{activeBlockLabel}</span>
          <ChevronDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
        </button>

        {openStyle && (
          <Popover>
            {BLOCK_STYLES.map((item) => (
              <MenuItem
                key={item.tag}
                active={currentBlockTag === item.tag}
                onClick={() => {
                  closeAllMenus()
                  run(`format_${item.tag}`, () => {
                    if (!editor) return
                    if (item.tag === 'p') editor.chain().focus().setParagraph().run()
                    else if (/^h[1-6]$/.test(item.tag)) {
                      const level = parseInt(item.tag.substring(1), 10) as 1 | 2 | 3
                      editor.chain().focus().toggleHeading({ level }).run()
                    } else if (item.tag === 'blockquote') {
                      editor.chain().focus().toggleBlockquote().run()
                    } else if (item.tag === 'pre') {
                      editor.chain().focus().toggleCodeBlock().run()
                    }
                  })
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <item.icon style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                  {item.label}
                </span>
                {currentBlockTag === item.tag && <Check style={{ width: '14px', height: '14px' }} />}
              </MenuItem>
            ))}
          </Popover>
        )}
      </div>

      <Divider />

      {/* Font family + size */}
      <div style={GROUP_STYLE}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              const next = !openFont
              closeAllMenus()
              setOpenFont(next)
            }}
            title="Font Family"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              padding: '0 8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                fontFamily:
                  FONT_FAMILIES.find((f) => f.value === currentFontFamily)?.fontStyle,
              }}
            >
              {currentFontFamily}
            </span>
            <ChevronDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
          </button>

          {openFont && (
            <Popover width={176}>
              <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
                {FONT_FAMILIES.map((font) => (
                  <MenuItem
                    key={font.value}
                    active={currentFontFamily === font.value}
                    onClick={() => {
                      closeAllMenus()
                      run('font_family', () => editor?.chain().focus().setFontFamily(font.value).run())
                    }}
                  >
                    <span style={{ fontFamily: font.fontStyle }}>{font.label}</span>
                    {currentFontFamily === font.value && <Check style={{ width: '14px', height: '14px' }} />}
                  </MenuItem>
                ))}
              </div>
            </Popover>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            paddingLeft: '6px',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            title="Decrease Font Size"
            onMouseDown={(e) => {
              e.preventDefault()
              const nextSize = Math.max(8, currentFontSize - 1)
              run('font_size', () => editor?.chain().focus().setFontSize(`${nextSize}pt`).run())
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '24px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
            }}
          >
            <Minus style={{ width: '12px', height: '12px' }} />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                const next = !openSize
                closeAllMenus()
                setOpenSize(next)
              }}
              style={{
                height: '24px',
                padding: '0 6px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--foreground)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {currentFontSize}pt
            </button>

            {openSize && (
              <Popover width={72}>
                <div style={{ maxHeight: '192px', overflowY: 'auto' }}>
                  {FONT_SIZES.map((size) => (
                    <MenuItem
                      key={size}
                      active={currentFontSize === size}
                      onClick={() => {
                        closeAllMenus()
                        run('font_size', () => editor?.chain().focus().setFontSize(`${size}pt`).run())
                      }}
                      style={{ justifyContent: 'center' }}
                    >
                      {size} pt
                    </MenuItem>
                  ))}
                </div>
              </Popover>
            )}
          </div>

          <button
            type="button"
            title="Increase Font Size"
            onMouseDown={(e) => {
              e.preventDefault()
              const nextSize = Math.min(72, currentFontSize + 1)
              run('font_size', () => editor?.chain().focus().setFontSize(`${nextSize}pt`).run())
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '24px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
            }}
          >
            <Plus style={{ width: '12px', height: '12px' }} />
          </button>
        </div>
      </div>

      <Divider />

      {/* Inline formatting */}
      <div style={GROUP_STYLE}>
        <ToolButton
          icon={Bold}
          title="Bold (Ctrl+B)"
          active={isActive('bold')}
          onClick={() => run('bold', () => editor?.chain().focus().toggleBold().run())}
        />
        <ToolButton
          icon={Italic}
          title="Italic (Ctrl+I)"
          active={isActive('italic')}
          onClick={() => run('italic', () => editor?.chain().focus().toggleItalic().run())}
        />
        <ToolButton
          icon={UnderlineIcon}
          title="Underline (Ctrl+U)"
          active={isActive('underline')}
          onClick={() => run('underline', () => editor?.chain().focus().toggleUnderline().run())}
        />
        <ToolButton
          icon={Strikethrough}
          title="Strikethrough"
          active={isActive('strike')}
          onClick={() => run('strikethrough', () => editor?.chain().focus().toggleStrike().run())}
        />
        <ToolButton
          icon={SuperscriptIcon}
          title="Superscript"
          active={isActive('superscript')}
          onClick={() => run('superscript', () => editor?.chain().focus().toggleSuperscript().run())}
        />
        <ToolButton
          icon={SubscriptIcon}
          title="Subscript"
          active={isActive('subscript')}
          onClick={() => run('subscript', () => editor?.chain().focus().toggleSubscript().run())}
        />
      </div>

      <Divider />

      {/* Color + highlight */}
      <div style={GROUP_STYLE}>
        <div style={{ position: 'relative' }}>
          <ToolButton
            icon={Palette}
            title="Text Color"
            indicatorColor={currentColor}
            onClick={() => {
              const next = !openColor
              closeAllMenus()
              setOpenColor(next)
            }}
          />
          {openColor && (
            <Popover width={120}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      closeAllMenus()
                      run('font_color', () => editor?.chain().focus().setColor(c).run())
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: c,
                      ...SHADOW_BORDER,
                      cursor: 'pointer',
                      transition: 'transform 120ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>
            </Popover>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <ToolButton
            icon={Highlighter}
            title="Highlight Color"
            indicatorColor={currentHighlight}
            onClick={() => {
              const next = !openHighlight
              closeAllMenus()
              setOpenHighlight(next)
            }}
          />
          {openHighlight && (
            <Popover width={120}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {PRESET_HIGHLIGHTS.map((hl) => (
                  <button
                    key={hl}
                    type="button"
                    title={hl === 'transparent' ? 'No Highlight' : hl}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      closeAllMenus()
                      run('highlight', () => editor?.chain().focus().toggleHighlight({ color: hl }).run())
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: hl === 'transparent' ? 'var(--background)' : hl,
                      ...SHADOW_BORDER,
                      cursor: 'pointer',
                      transition: 'transform 120ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>
            </Popover>
          )}
        </div>
      </div>

      <Divider />

      {/* Alignment, lists, indent */}
      <div style={GROUP_STYLE}>
        <ToolButton
          icon={AlignLeft}
          title="Align Left"
          active={isActive({ textAlign: 'left' })}
          onClick={() => run('align_left', () => editor?.chain().focus().setTextAlign('left').run())}
        />
        <ToolButton
          icon={AlignCenter}
          title="Align Center"
          active={isActive({ textAlign: 'center' })}
          onClick={() => run('align_center', () => editor?.chain().focus().setTextAlign('center').run())}
        />
        <ToolButton
          icon={AlignRight}
          title="Align Right"
          active={isActive({ textAlign: 'right' })}
          onClick={() => run('align_right', () => editor?.chain().focus().setTextAlign('right').run())}
        />
        <ToolButton
          icon={AlignJustify}
          title="Justify"
          active={isActive({ textAlign: 'justify' })}
          onClick={() => run('align_justify', () => editor?.chain().focus().setTextAlign('justify').run())}
        />
        <ToolButton
          icon={List}
          title="Bullet List"
          active={isActive('bulletList')}
          onClick={() => run('bullet_list', () => editor?.chain().focus().toggleBulletList().run())}
        />
        <ToolButton
          icon={ListOrdered}
          title="Numbered List"
          active={isActive('orderedList')}
          onClick={() => run('ordered_list', () => editor?.chain().focus().toggleOrderedList().run())}
        />
        <ToolButton
          icon={Outdent}
          title="Outdent"
          onClick={() => run('outdent', () => editor?.chain().focus().outdent().run())}
        />
        <ToolButton
          icon={Indent}
          title="Indent"
          onClick={() => run('indent', () => editor?.chain().focus().indent().run())}
        />
      </div>

      <Divider />

      {/* Inserts */}
      <div style={GROUP_STYLE}>
        <div style={{ position: 'relative' }}>
          <ToolButton
            icon={TableIcon}
            title="Insert & Manage Table"
            active={isActive('table')}
            onClick={() => {
              const next = !openTableMenu
              closeAllMenus()
              setOpenTableMenu(next)
            }}
          />
          {openTableMenu && (
            <Popover width={180}>
              <MenuItem
                onClick={() => {
                  closeAllMenus()
                  run('insert_table', () =>
                    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                  )
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus style={{ width: '14px', height: '14px' }} />
                  Insert 3×3 Table
                </span>
              </MenuItem>
              {editor?.isActive('table') && (
                <>
                  <MenuItem onClick={() => { closeAllMenus(); editor.chain().focus().addRowAfter().run() }}>
                    Add Row Below
                  </MenuItem>
                  <MenuItem onClick={() => { closeAllMenus(); editor.chain().focus().addColumnAfter().run() }}>
                    Add Column Right
                  </MenuItem>
                  <MenuItem
                    onClick={() => { closeAllMenus(); editor.chain().focus().deleteTable().run() }}
                    style={{ color: 'var(--destructive)' }}
                  >
                    Delete Table
                  </MenuItem>
                </>
              )}
            </Popover>
          )}
        </div>

        <ToolButton
          icon={ImageIcon}
          title="Insert Image URL"
          onClick={() => {
            const url = window.prompt('Enter Image URL:')
            if (url) {
              run('insert_image', () => editor?.chain().focus().setImage({ src: url }).run())
            }
          }}
        />

        <button
          type="button"
          disabled={isImporting}
          onMouseDown={(e) => {
            e.preventDefault()
            fileInputRef.current?.click()
          }}
          title="Import Document (.docx, .doc, .pdf, .txt, .html)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 10px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: isImporting ? 'not-allowed' : 'pointer',
            opacity: isImporting ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          <FileUp style={{ width: '14px', height: '14px' }} />
          {isImporting ? 'Importing…' : 'Import File'}
        </button>

        <ToolButton
          icon={HRLine}
          title="Horizontal Line"
          onClick={() => run('horizontal_rule', () => editor?.chain().focus().setHorizontalRule().run())}
        />

        <ToolButton
          icon={RotateCcw}
          title="Clear Formatting"
          onClick={() =>
            run('clear_formatting', () => editor?.chain().focus().unsetAllMarks().clearNodes().run())
          }
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Page setup */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            const next = !openPageSetup
            closeAllMenus()
            setOpenPageSetup(next)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 10px',
            borderRadius: '6px',
            border: 'none',
            ...SHADOW_BORDER,
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <SlidersHorizontal style={{ width: '14px', height: '14px', opacity: 0.7 }} />
          <span>Page Setup</span>
          <ChevronDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
        </button>

        {openPageSetup && (
          <Popover width={300} rightAligned>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted-foreground)',
                    marginBottom: '6px',
                  }}
                >
                  Orientation
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                  {(['portrait', 'landscape'] as PageOrientation[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onOrientationChange(value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        height: '30px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: 'none',
                        ...SHADOW_BORDER,
                        backgroundColor: orientation === value ? 'var(--primary)' : 'transparent',
                        color: orientation === value ? 'var(--primary-foreground)' : 'var(--foreground)',
                        fontSize: '12px',
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {value === 'portrait' ? (
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="0.75" y="0.75" width="8.5" height="12.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      ) : (
                        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      )}
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted-foreground)',
                    marginBottom: '6px',
                  }}
                >
                  Page Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                  {Object.entries(PAGE_SIZES).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPageSizeChange(key as PageSizeKey)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        ...SHADOW_BORDER,
                        backgroundColor: pageSize === key ? 'var(--primary)' : 'transparent',
                        color: pageSize === key ? 'var(--primary-foreground)' : 'var(--foreground)',
                        fontSize: '12px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {info.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted-foreground)',
                    marginBottom: '6px',
                  }}
                >
                  Margins (Inches)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {(['top', 'bottom', 'left', 'right'] as (keyof MarginValues)[]).map((m) => (
                    <div
                      key={m}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}
                    >
                      <span
                        style={{
                          textTransform: 'capitalize',
                          fontSize: '12px',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        {m}:
                      </span>
                      <input
                        type="number"
                        min={0.25}
                        max={3}
                        step={0.25}
                        value={margins[m]}
                        onChange={(e) =>
                          onMarginsChange({ ...margins, [m]: parseFloat(e.target.value) || 0.5 })
                        }
                        style={{
                          width: '48px',
                          height: '24px',
                          textAlign: 'center',
                          borderRadius: '6px',
                          border: 'none',
                          ...SHADOW_BORDER,
                          backgroundColor: 'var(--background)',
                          color: 'var(--foreground)',
                          fontSize: '12px',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                        onFocus={(e) => Object.assign(e.currentTarget.style, FOCUS_RING)}
                        onBlur={(e) => (e.currentTarget.style.outline = 'none')}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Header section */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--muted-foreground)',
                      marginBottom: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showHeader}
                      onChange={(e) => onShowHeaderChange(e.target.checked)}
                      style={{ width: '12px', height: '12px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    Header
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={headerContent}
                      onChange={(e) => onHeaderChange(e.target.value)}
                      disabled={!showHeader}
                      placeholder="Header text…"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: '26px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: 'none',
                        ...SHADOW_BORDER,
                        backgroundColor: 'var(--background)',
                        color: 'var(--foreground)',
                        fontSize: '12px',
                        outline: 'none',
                        fontFamily: 'inherit',
                        opacity: showHeader ? 1 : 0.45,
                        cursor: showHeader ? 'text' : 'not-allowed',
                      }}
                      onFocus={(e) => Object.assign(e.currentTarget.style, FOCUS_RING)}
                      onBlur={(e) => (e.currentTarget.style.outline = 'none')}
                    />
                    <NumberFormatSelect
                      value={headerNumberFormat}
                      onChange={onHeaderNumberFormatChange}
                      disabled={!showHeader}
                    />
                  </div>
                </div>
                {/* Footer section */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--muted-foreground)',
                      marginBottom: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showFooter}
                      onChange={(e) => onShowFooterChange(e.target.checked)}
                      style={{ width: '12px', height: '12px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    Footer
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={footerContent}
                      onChange={(e) => onFooterChange(e.target.value)}
                      disabled={!showFooter}
                      placeholder="Footer text…"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: '26px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: 'none',
                        ...SHADOW_BORDER,
                        backgroundColor: 'var(--background)',
                        color: 'var(--foreground)',
                        fontSize: '12px',
                        outline: 'none',
                        fontFamily: 'inherit',
                        opacity: showFooter ? 1 : 0.45,
                        cursor: showFooter ? 'text' : 'not-allowed',
                      }}
                      onFocus={(e) => Object.assign(e.currentTarget.style, FOCUS_RING)}
                      onBlur={(e) => (e.currentTarget.style.outline = 'none')}
                    />
                    <NumberFormatSelect
                      value={footerNumberFormat}
                      onChange={onFooterNumberFormatChange}
                      disabled={!showFooter}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Popover>
        )}
      </div>

      {/* Export document */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            const next = !openExport
            closeAllMenus()
            setOpenExport(next)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 10px',
            borderRadius: '6px',
            border: 'none',
            ...SHADOW_BORDER,
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          title="Export or Print Document"
        >
          <Download style={{ width: '14px', height: '14px', opacity: 0.7 }} />
          <span>Export</span>
          <ChevronDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
        </button>

        {openExport && (
          <Popover width={190} rightAligned>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <MenuItem
                onClick={() => {
                  setOpenExport(false)
                  if (editor) downloadDOCX(editor.getHTML(), documentTitle)
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                  <span>Word (.doc / .docx)</span>
                </span>
              </MenuItem>

              <MenuItem
                onClick={() => {
                  setOpenExport(false)
                  if (editor) downloadHTML(editor.getHTML(), documentTitle)
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCode style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                  <span>HTML Document</span>
                </span>
              </MenuItem>

              <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />

              <MenuItem
                onClick={() => {
                  setOpenExport(false)
                  printDocument()
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Printer style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                  <span>Print / PDF</span>
                </span>
              </MenuItem>
            </div>
          </Popover>
        )}
      </div>
    </div>
  )
}

// ─── Number format selector ─────────────────────────────────────────────────

interface NumberFormatSelectProps {
  value: PageNumberFormat
  onChange: (value: PageNumberFormat) => void
  disabled?: boolean
}

/** Page-number style dropdown: None / 1, 2, 3… / I, II, III… */
function NumberFormatSelect({ value, onChange, disabled }: NumberFormatSelectProps): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PageNumberFormat)}
      disabled={disabled}
      title="Page number format"
      style={{
        height: '26px',
        borderRadius: '6px',
        border: 'none',
        ...SHADOW_BORDER,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontSize: '11px',
        outline: 'none',
        fontFamily: 'inherit',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '0 4px',
      }}
    >
      <option value="none">None</option>
      <option value="number">1, 2, 3</option>
      <option value="roman">I, II, III</option>
    </select>
  )
}

// ─── Bubble + Floating menus ────────────────────────────────────────────────

/** Selection toolbar shown above highlighted text (TipTap BubbleMenu). */
function TiptapBubbleMenu({ editor }: { editor: Editor | null }): JSX.Element | null {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  if (!editor) return null

  const MENU_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px',
    borderRadius: '8px',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    ...SHADOW_CARD,
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
  }

  return (
    <BubbleMenu editor={editor} options={BUBBLE_MENU_OPTIONS} shouldShow={bubbleMenuShouldShow}>
      <div style={MENU_STYLE}>
        <ToolButton
          icon={Bold}
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          icon={Italic}
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          icon={UnderlineIcon}
          title="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          icon={Strikethrough}
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <Divider />
        <ToolButton
          icon={Heading1}
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          icon={Heading2}
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          icon={Quote}
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          icon={Highlighter}
          title="Highlight"
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#ffff00' }).run()}
        />
        <Divider />
        <ToolButton
          icon={RotateCcw}
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
      </div>
    </BubbleMenu>
  )
}

/** Quick-insert toolbar shown at the start of an empty paragraph. */
function TiptapFloatingMenu({ editor }: { editor: Editor | null }): JSX.Element | null {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  if (!editor) return null

  const MENU_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px',
    borderRadius: '8px',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    ...SHADOW_CARD,
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
  }

  return (
    <FloatingMenu editor={editor} options={FLOATING_MENU_OPTIONS} shouldShow={floatingMenuShouldShow}>
      <div style={MENU_STYLE}>
        <ToolButton
          icon={Heading1}
          title="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          icon={Heading2}
          title="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          icon={List}
          title="Bullet List"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          icon={ListOrdered}
          title="Numbered List"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          icon={Quote}
          title="Blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          icon={TableIcon}
          title="Table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        />
        <ToolButton
          icon={Code2}
          title="Code Block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolButton
          icon={HRLine}
          title="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </div>
    </FloatingMenu>
  )
}

// ─── ProseMirror canvas styles ──────────────────────────────────────────────

/** Academic document styles applied to the ProseMirror canvas. */
const PROSE_STYLES = `
  .ProseMirror {
    outline: none !important;
    min-height: 60vh;
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    line-height: 1.6;
    background: transparent;
    color: #171717;
    word-wrap: break-word;
    caret-color: #171717;
  }
  .ProseMirror span[style*="color:#000000"],
  .ProseMirror span[style*="color: #000000"],
  .ProseMirror span[style*="color:#000"],
  .ProseMirror span[style*="color: #000"],
  .ProseMirror span[style*="color:black"],
  .ProseMirror span[style*="color: rgb(0, 0, 0)"],
  .ProseMirror span[style*="color: rgb(0,0,0)"] { color: inherit; }
  .ProseMirror h1 { font-size: 18pt; font-weight: 700; margin: 0.85em 0 0.35em; letter-spacing: -0.02em; }
  .ProseMirror h1.title { font-size: 20pt; font-weight: 700; margin: 0.75em 0 0.35em; }
  .ProseMirror h2 { font-size: 14.5pt; font-weight: 700; margin: 0.75em 0 0.3em; }
  .ProseMirror h2.subtitle { font-size: 14pt; font-weight: 600; font-style: italic; margin: 0.35em 0 0.5em; }
  .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6 {
    font-size: 12.5pt; font-weight: 700; margin: 0.65em 0 0.25em;
  }
  .ProseMirror p { margin-bottom: 0.25em; line-height: 1.5 !important; }
  .ProseMirror p:empty, .ProseMirror p > br:only-child { min-height: 0.6em; display: block; width: 100%; margin-bottom: 0 !important; }
  .ProseMirror blockquote {
    border-left: 3px solid var(--foreground);
    margin: 0.75em 0;
    padding-left: 1em;
    color: var(--muted-foreground);
    font-style: italic;
  }
  .ProseMirror pre {
    background: var(--secondary);
    border-radius: 6px;
    padding: 0.75em 1em;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    overflow-x: auto;
    margin: 0.75em 0;
  }
  .ProseMirror code {
    background: var(--secondary);
    border-radius: 3px;
    padding: 0.15em 0.3em;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }
  .ProseMirror table {
    border-collapse: collapse;
    width: 100%;
    margin: 1.25em 0;
    border: 1px solid var(--border);
    table-layout: fixed;
  }
  .ProseMirror th, .ProseMirror td {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
    min-width: 1em;
    vertical-align: top;
  }
  .ProseMirror th {
    background-color: var(--secondary);
    color: var(--foreground);
    font-weight: 600;
  }
  .ProseMirror th[style*="background-color:#000"],
  .ProseMirror th[style*="background-color: #000"],
  .ProseMirror th[style*="background-color:#1"],
  .ProseMirror th[style*="background-color:#2"],
  .ProseMirror th[style*="background-color:#3"],
  .ProseMirror th[style*="background-color:#4"],
  .ProseMirror th[style*="background-color:black"],
  .ProseMirror th[style*="background-color: rgb(0"],
  .ProseMirror th[style*="background-color:rgba(0"],
  .ProseMirror th[style*="background-color: #0"],
  .ProseMirror th[style*="background-color: #1"],
  .ProseMirror th[style*="background-color: #2"],
  .ProseMirror th[style*="background-color: #3"],
  .ProseMirror th[style*="background-color: #4"],
  .ProseMirror th[style*="background-color:#1F"],
  .ProseMirror th[style*="background-color:#1a"],
  .ProseMirror th[style*="background-color:#2d"],
  .ProseMirror th[style*="background-color:#21"],
  .ProseMirror th[style*="background-color:#2f"] {
    color: #ffffff !important;
  }
  .ProseMirror td[style*="background-color:#000"],
  .ProseMirror td[style*="background-color: #000"],
  .ProseMirror td[style*="background-color:#1"],
  .ProseMirror td[style*="background-color:#2"],
  .ProseMirror td[style*="background-color:#3"],
  .ProseMirror td[style*="background-color:#4"],
  .ProseMirror td[style*="background-color:black"],
  .ProseMirror td[style*="background-color: rgb(0"],
  .ProseMirror td[style*="background-color:rgba(0"],
  .ProseMirror td[style*="background-color: #0"],
  .ProseMirror td[style*="background-color: #1"],
  .ProseMirror td[style*="background-color: #2"],
  .ProseMirror td[style*="background-color: #3"],
  .ProseMirror td[style*="background-color: #4"],
  .ProseMirror td[style*="background-color:#1F"],
  .ProseMirror td[style*="background-color:#1a"],
  .ProseMirror td[style*="background-color:#2d"],
  .ProseMirror td[style*="background-color:#21"],
  .ProseMirror td[style*="background-color:#2f"] {
    color: #ffffff !important;
  }
  .ProseMirror th p, .ProseMirror td p {
    margin: 0 !important;
    line-height: 1.35 !important;
  }
  .ProseMirror th[style*="background-color:#000"] p,
  .ProseMirror th[style*="background-color: #000"] p,
  .ProseMirror th[style*="background-color:#1"] p,
  .ProseMirror th[style*="background-color:#2"] p,
  .ProseMirror th[style*="background-color:#3"] p,
  .ProseMirror th[style*="background-color:#4"] p,
  .ProseMirror th[style*="background-color:black"] p,
  .ProseMirror th[style*="background-color: rgb(0"] p,
  .ProseMirror th[style*="background-color:#1F"] p,
  .ProseMirror th[style*="background-color:#1a"] p {
    color: #ffffff !important;
  }
  .ProseMirror img {
    height: auto;
    display: block;
    border-radius: 4px;
    outline: none;
  }
  .ProseMirror hr {
    border: none;
    border-top: 2px solid var(--border);
    margin: 1.5em 0;
  }
  .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
  .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
  .ProseMirror li { margin: 0.2em 0; }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: 'Start writing your document…';
    float: left;
    color: var(--muted-foreground);
    opacity: 0.45;
    pointer-events: none;
    height: 0;
    font-style: italic;
  }
  .ProseMirror ::selection { background: rgba(99, 102, 241, 0.2); }
  .ProseMirror .ProseMirror-selectednode { outline: 2px solid var(--primary); outline-offset: 2px; }
  /* Suppress the ProseMirror selection outline on images — the library handles its own */
  .ProseMirror [data-resize-image-ui] { outline: none !important; }
  .ProseMirror-selectednode:has([data-resize-image-ui]) { outline: none !important; }
  .ProseMirror [data-resize-image-ui="position-controller"] {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: var(--popover, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    position: absolute;
    top: -44px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    animation: fadeIn 150ms ease-out;
    cursor: default;
  }
  .ProseMirror [data-resize-image-ui="position-controller"] img,
  .ProseMirror [data-resize-image-ui="position-controller"] svg {
    width: 20px;
    height: 20px;
    padding: 3px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 120ms, background 120ms;
    background: transparent;
    border: none;
  }
  .ProseMirror [data-resize-image-ui="position-controller"] img:hover,
  .ProseMirror [data-resize-image-ui="position-controller"] svg:hover {
    opacity: 1;
    background: var(--secondary, #f3f4f6);
  }
  .ProseMirror [data-resize-image-ui="resize-handle"] {
    width: 10px;
    height: 10px;
    background: var(--primary, #6366f1);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    opacity: 0.9;
  }
  .ProseMirror .grammar-issue {
    text-decoration-skip-ink: none;
    cursor: pointer;
  }
  .ProseMirror .grammar-issue.grammar-straight.grammar-kind-grammar {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    text-decoration-color: #ef4444;
  }
  .ProseMirror .grammar-issue.grammar-straight.grammar-kind-spelling {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    text-decoration-color: #f59e0b;
  }
  .ProseMirror .grammar-issue.grammar-wavy.grammar-kind-grammar {
    text-decoration: underline wavy #ef4444;
  }
  .ProseMirror .grammar-issue.grammar-wavy.grammar-kind-spelling {
    text-decoration: underline wavy #f59e0b;
  }
  .ProseMirror .grammar-issue:hover {
    background-color: rgba(239, 68, 68, 0.08);
  }
  .ProseMirror .agentic-suggestion-pulse {
    background-color: color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 8%, transparent);
    border-radius: 6px;
    outline: 2px dashed var(--agentic-pulse-color, #6366f1);
    outline-offset: 3px;
    animation: agenticPulse 2s ease-in-out infinite;
    transition: all 200ms ease;
  }
  @keyframes agenticPulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 40%, transparent);
      background-color: color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 4%, transparent);
    }
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 15%, transparent);
      background-color: color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 8%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 40%, transparent);
      background-color: color-mix(in srgb, var(--agentic-pulse-color, #6366f1) 4%, transparent);
    }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
`

// ─── Canvas component ───────────────────────────────────────────────────────

interface TiptapCanvasProps {
  editor: Editor | null
}

/**
 * Renders the TipTap editor canvas with bubble + floating menus and prose styles.
 * Document.tsx places this inside the paper sheet.
 */
export function TiptapCanvas({ editor }: TiptapCanvasProps): JSX.Element {
  return (
    <>
      <style>{PROSE_STYLES}</style>
      <TiptapBubbleMenu editor={editor} />
      <TiptapFloatingMenu editor={editor} />
      {editor && <EditorContent editor={editor} />}
    </>
  )
}

/** Re-export Editor type so consumers import from this single file. */
export type { Editor }
