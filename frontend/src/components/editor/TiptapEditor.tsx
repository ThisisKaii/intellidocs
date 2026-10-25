import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
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
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
// Pagination-aware tables: rows render as CSS-grid blocks (and rows joined by a
// rowspan as small row groups) so tiptap-pagination-plus can break a table
// between rows. Stock <table> layout inside the paginator loops forever.
import { TablePlus, TableRowPlus, TableCellPlus, TableHeaderPlus } from 'tiptap-table-plus'
import type { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view'
import type { NodeViewRendererProps } from '@tiptap/core'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Highlight from '@tiptap/extension-highlight'
import { IeeePrintPreview } from './IeeePrintPreview'
import { GrammarUnderlineExtension } from './GrammarUnderlineExtension'
import { SuggestionDecorationsExtension } from './SuggestionDecorationsExtension'
import { BlueprintGuideExtension } from './BlueprintGuideExtension'
import { HarperLinterExtension } from './HarperLinterExtension'
import { StyleGuideExtension } from './StyleGuideExtension'
import { MarkdownTriggers } from './MarkdownTriggers'
import { PageBreak } from './PageBreak'
import { PageFlowExtension } from './PageFlow'
import { TabStop } from './TabStop'
import {
  HeaderFooterExtension,
  type PageSizeKey,
  type PageOrientation,
  type MarginValues,
  type PageNumberFormat,
  type HeaderFooterPlacement,
  PAGE_SIZES,
  inToPx,
} from './HeaderFooterPlugin'
import { AcademicObjectsExtension } from './AcademicObjects'
import { basePresetKey } from './academicPresets'
import { CaptionExtension } from './CaptionExtension'
import { GeneratedBlockExtension } from './DocumentParts'
import { applyIeeeNumbering } from './ieeeNumberingCommand'
import { convertToIeee } from './ieeeConvertCommand'
import EditorStylesPanel from './EditorStylesPanel'
import {
  BookOpen,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
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
  Hash,
  LayoutTemplate,
  Indent,
  Outdent,
  Table as TableIcon,
  Image as ImageIcon,
  FileUp,
  Minus as HRLine,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Download,
  FileText,
  Printer,
  FileCode,
  GraduationCap,
  UserCog,
  BadgeInfo,
  Maximize2,
  Columns,
  Minimize2,
  Merge,
  Scissors as SplitSquare,
  Palette as PaletteIcon,
  Type,
} from 'lucide-react'
import { api } from '@/services/api'
import { FontSizeExtension } from './FontSizeExtension'
import { IndentExtension } from './IndentExtension'
import { exportThesisWord, exportThesisPdf } from '@/lib/thesisExport'
import { exportIeeeDocx } from '@/lib/ieeeExport'
import {
  snapshotTableContext,
  snapshotTableShape,
  snapshotImageContext,
  type BehaviorEventPayload,
  type ImageAlignment,
  type TableAlignment,
  type AcademicTableStyle,
  type ImageWrapMode,
} from './behaviorListener'
import { ImageResizeBehaviorExtension } from './ImageResizeBehaviorExtension'
import ImageOptionsToolbar, { type ImageWrapStyle } from './ImageOptionsToolbar'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

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

// Re-export types from HeaderFooterPlugin (single source of truth)
export type {
  PageSizeKey,
  PageOrientation,
  MarginValues,
  PageNumberFormat,
  HeaderFooterPlacement,
  HeaderFooterZoneConfig,
  HeaderFooterConfig,
  HeaderFooterState,
} from './HeaderFooterPlugin'
export { createDefaultHeaderFooterConfig, PAGE_SIZES } from './HeaderFooterPlugin'

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
  // Concentric with the 8px ToolButtons inside (8px inner + 2px padding).
  borderRadius: '10px',
  ...SHADOW_BORDER,
}

const POPOVER_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  marginTop: '6px',
  zIndex: 60,
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  // Concentric with the 6px-padded MenuItems inside (6px inner + 6px padding).
  borderRadius: '12px',
  ...SHADOW_CARD,
  animation: 'popoverIn 140ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
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
  // First-line indent: imported Word paragraphs carry it (and an explicit 0 so
  // an applied preset's 0.5in indent cannot override the document's own).
  'text-indent',
])

/** Table cells also keep Word's row height as a minimum (text can still grow the row). */
const CELL_STYLE_PROPS: ReadonlySet<string> = new Set(['min-height'])

/** Extract only whitelisted CSS properties from an inline style string. */
function filterStyle(raw: string | null, extra: ReadonlySet<string> = new Set()): string | null {
  if (!raw) return null
  const kept: string[] = []
  for (const decl of raw.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon < 1) continue
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    if (ALLOWED_STYLE_PROPS.has(prop) || extra.has(prop)) kept.push(trimmed)
  }
  return kept.length > 0 ? kept.join('; ') : null
}

/** Read a margin-*-pt value from an inline style string; 0 when absent. */
function parseMarginPt(style: string | null, prop: 'margin-top' | 'margin-bottom'): number {
  if (!style) return 0
  const match = style.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)pt`, 'i'))
  return match ? Number(match[1]) : 0
}

/**
 * Merge paragraph spacing (Space Before/After, in pt) into an existing inline
 * style string, replacing any previous margin-top/margin-bottom declarations
 * while preserving every other whitelisted property.
 */
function mergeSpacingStyle(current: string | null, beforePt: number, afterPt: number): string {
  const kept: string[] = []
  if (current) {
    for (const decl of current.split(';')) {
      const trimmed = decl.trim()
      if (!trimmed) continue
      const prop = trimmed.slice(0, trimmed.indexOf(':')).trim().toLowerCase()
      if (prop === 'margin-top' || prop === 'margin-bottom') continue
      kept.push(trimmed)
    }
  }
  kept.push(`margin-top: ${beforePt}pt`, `margin-bottom: ${afterPt}pt`)
  return kept.join('; ')
}

/** Width in px of the printable text column for a page size + margins. */
function printableWidthPx(size: PageSizeKey, margins: MarginValues): number {
  return PAGE_SIZES[size].width - inToPx(margins.left + margins.right)
}

/**
 * Rewrite explicit px image widths in imported HTML so no image is wider than
 * the printable page area. Runs on the raw HTML string before TipTap parses
 * it; images that already fit are left untouched.
 */
function clampImageWidthsInHtml(html: string, maxWidthPx: number): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('img').forEach((img) => {
    const attrWidth = Number(img.getAttribute('width')) || 0
    const styleWidth = Number((img.style.width || '').replace('px', '')) || 0
    if (Math.max(attrWidth, styleWidth) <= maxWidthPx) return
    const clamped = Math.round(maxWidthPx)
    img.setAttribute('width', String(clamped))
    img.style.width = `${clamped}px`
    img.style.height = 'auto'
  })
  return parsed.body.innerHTML
}

// ─── Custom node extensions preserving imported styles and cell backgrounds ─

/**
 * Apply a table cell's imported style/background/colour to its DOM element.
 * The table-plus cell node views build their own <td>/<th> and never render
 * our extra attributes, so without this every imported cell would lose its
 * background, padding and alignment. `applied` remembers what was set so an
 * attribute change removes the old declarations.
 */
function syncCellAttributes(dom: HTMLElement, attrs: Record<string, unknown>, applied: Set<string>): void {
  const declarations: Array<[string, string]> = []
  const style = typeof attrs.style === 'string' ? attrs.style : ''
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 1) continue
    declarations.push([declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim()])
  }
  if (typeof attrs.backgroundColor === 'string' && attrs.backgroundColor) {
    declarations.push(['background-color', attrs.backgroundColor])
  }
  if (typeof attrs.color === 'string' && attrs.color) declarations.push(['color', attrs.color])
  applied.forEach((property) => dom.style.removeProperty(property))
  applied.clear()
  for (const [property, value] of declarations) {
    dom.style.setProperty(property, value)
    applied.add(property)
  }
}

/** Wrap a table-plus cell node view so it also renders our extra cell attributes. */
function withCellAttributes(
  parentView: ((props: NodeViewRendererProps) => ProseMirrorNodeView) | undefined,
): ((props: NodeViewRendererProps) => ProseMirrorNodeView) | null {
  if (!parentView) return null
  return (props) => {
    const view = parentView(props)
    const dom = view.dom as HTMLElement
    const applied = new Set<string>()
    syncCellAttributes(dom, props.node.attrs, applied)
    const originalUpdate = view.update
    return {
      ...view,
      update: (...args: Parameters<NonNullable<ProseMirrorNodeView['update']>>) => {
        const accepted = originalUpdate ? originalUpdate.apply(view, args) : true
        if (accepted) syncCellAttributes(dom, args[0].attrs, applied)
        return accepted
      },
    }
  }
}

export const CustomTableCell = TableCellPlus.extend({
  addNodeView() {
    return withCellAttributes(this.parent?.() ?? undefined)
  },
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
        parseHTML: (el) => filterStyle(el.getAttribute('style'), CELL_STYLE_PROPS),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
    }
  },
})

export const CustomTableHeader = TableHeaderPlus.extend({
  addNodeView() {
    return withCellAttributes(this.parent?.() ?? undefined)
  },
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
        parseHTML: (el) => filterStyle(el.getAttribute('style'), CELL_STYLE_PROPS),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
    }
  },
})

// ─── Editor extensions (single source of truth) ─────────────────────────────

/**
 * Blueprint placeholder attributes, shared by every block type that can carry
 * one. `guide` is the standard-reference hint drawn inside the dashed box;
 * `guideText` is the original placeholder text, which BlueprintGuideExtension
 * compares against to detect that the student has written over the placeholder.
 * `guideGroup` binds related sections (e.g. the author block) so formatting
 * one element can offer to format the rest of the group to match.
 */
const guideAttributes = {
  guide: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-guide'),
    renderHTML: (a: { guide: string | null }) =>
      a.guide ? { 'data-guide': a.guide } : {},
  },
  guideText: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-guide-text'),
    renderHTML: (a: { guideText: string | null }) =>
      a.guideText ? { 'data-guide-text': a.guideText } : {},
  },
  guideGroup: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-guide-group'),
    renderHTML: (a: { guideGroup: string | null }) =>
      a.guideGroup ? { 'data-guide-group': a.guideGroup } : {},
  },
}

/**
 * Paragraph spacing (Space Before / Space After, in pt) as an inline-style
 * margin override. Word-parity controls live in the Page Setup popover.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      setParagraphSpacing: (beforePt: number, afterPt: number) => ReturnType
    }
  }
}

const CustomParagraph = Paragraph.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      /**
       * Apply Space Before/After to every paragraph in the selection (or the
       * paragraph under the cursor when collapsed) by merging pt margins into
       * the `style` attribute.
       */
      setParagraphSpacing:
        (beforePt: number, afterPt: number) =>
        ({ state, tr, dispatch }) => {
          let changed = false
          const { from, to, empty, $from } = state.selection
          if (empty) {
            if ($from.parent.type.name !== 'paragraph') return false
            const pos = $from.before($from.depth)
            tr.setNodeMarkup(pos, undefined, {
              ...$from.parent.attrs,
              style: mergeSpacingStyle($from.parent.attrs.style as string | null, beforePt, afterPt),
            })
            changed = true
          } else {
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name !== 'paragraph') return
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                style: mergeSpacingStyle(node.attrs.style as string | null, beforePt, afterPt),
              })
              changed = true
            })
          }
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      styleSource: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-style-source'),
        renderHTML: (a) => (a.styleSource ? { 'data-style-source': a.styleSource } : {}),
      },
      style: {
        default: null,
        parseHTML: (el) => filterStyle(el.getAttribute('style')),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
      ...guideAttributes,
    }
  },
})

/** Center-aligned ImageResize: sets containerStyle to center by default. */
/**
 * Build the wrapper style for an image from its alignment.
 * Kept as a function so the attribute default, the HTML parser, and the
 * `setImageAlignment` command all derive the same string.
 */
function imageContainerStyle(alignment: ImageAlignment, width?: number | null): string {
  const sizing = width ? `width: ${width}px; height: auto; cursor: pointer;` : 'cursor: pointer;'
  switch (alignment) {
    case 'left':
      return `${sizing} margin: 0 auto 0 0;`
    case 'right':
      return `${sizing} margin: 0 0 0 auto;`
    case 'float':
      return `${sizing} margin: 0.5rem 0 1rem 1.5rem; float: left;`
    case 'center':
    default:
      return `${sizing} margin: 0 auto;`
  }
}

/**
 * Build the wrapper style for an image text-wrap mode (floating toolbar).
 * Mirrors `imageContainerStyle` so both commands write the same shape of
 * string into the single `containerStyle` attribute.
 *
 * Only properties the resize library's sanitizer whitelists belong here
 * (sizing, display, float, margins, cursor). The watermark / overlay /
 * clear modes carry their extra CSS via `data-wrap-mode` rules instead —
 * the sanitizer strips clear/position/z-index/opacity from this string.
 */
function imageWrapStyle(mode: ImageWrapStyle, width?: number | null): string {
  const sizing = width ? `width: ${width}px; height: auto; cursor: pointer;` : 'cursor: pointer;'
  switch (mode) {
    case 'inline':
      return `${sizing} display: inline-block !important; vertical-align: baseline !important; margin: 0.25rem 0.5rem !important;`
    case 'wrap-left':
      return `${sizing} float: left !important; clear: left !important; margin: 0.5rem 1.5rem 0.75rem 0 !important; max-width: 55%;`
    case 'wrap-right':
      return `${sizing} float: right !important; clear: right !important; margin: 0.5rem 0 0.75rem 1.5rem !important; max-width: 55%;`
    case 'wrap-both':
      return `${sizing} display: block !important; float: none !important; clear: none !important; margin: 0.75rem auto !important;`
    case 'behind-text':
      return `${sizing} position: relative !important; z-index: 0 !important; opacity: 0.82 !important; float: none !important; margin: 1rem auto !important;`
    case 'in-front':
      return `${sizing} position: relative !important; z-index: 30 !important; float: none !important; box-shadow: 0 4px 14px rgba(0,0,0,0.16) !important; margin: 1rem auto !important;`
    case 'break':
    default:
      return `${sizing} display: block !important; float: none !important; clear: both !important; margin: 1.5rem auto !important;`
  }
}

/** Read the explicit pixel width from an image wrapper style, when present. */
function readStyleWidth(style: string | null | undefined): number | null {
  if (!style) return null
  const match = /(?:^|;)\s*width:\s*([\d.]+)px/i.exec(style)
  return match ? Number(match[1]) : null
}

/** Rewrite a wrapper style with a new explicit width; null clears the sizing. */
function withImageWidth(style: string, width: number | null): string {
  const parts = style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => {
      const prop = part.split(':')[0]?.trim().toLowerCase()
      return prop !== 'width' && prop !== 'height'
    })
  if (width !== null) {
    parts.push(`width: ${width}px`, 'height: auto')
  }
  if (!parts.some((part) => part.toLowerCase().startsWith('cursor'))) {
    parts.push('cursor: pointer')
  }
  return `${parts.join('; ')};`
}

/** The image node under the current selection, or null when none is selected. */
function selectedImageNode(state: EditorState): ProseMirrorNode | null {
  const { selection } = state
  return selection instanceof NodeSelection && selection.node.type.name === 'imageResize'
    ? selection.node
    : null
}

const CenteredImageResize = ImageResize.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // How the image sits in the text column. Drives containerStyle.
      alignment: {
        default: 'center',
        parseHTML: (element) =>
          (element.getAttribute('data-alignment') as ImageAlignment | null) ?? 'center',
        renderHTML: (attributes) => {
          const value = attributes.alignment as ImageAlignment | null
          if (!value || value === 'center') return {}
          return { 'data-alignment': value }
        },
      },
      // True once the image carries a caption paragraph right below it. The
      // marker round-trips so `imageHasCaption` survives save/load.
      caption: {
        default: null,
        parseHTML: (element) => (element.dataset.caption === 'true' ? true : null),
        renderHTML: (attributes) => (attributes.caption ? { 'data-caption': 'true' } : {}),
      },
      // Text-wrap mode tag. The resize library's style sanitizer strips
      // clear/position/z-index/opacity from containerStyle, so those modes
      // are applied through CSS rules keyed on this attribute instead.
      wrapMode: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wrap-mode'),
        renderHTML: (attributes) =>
          attributes.wrapMode ? { 'data-wrap-mode': attributes.wrapMode } : {},
      },
      containerStyle: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('containerstyle')
          if (raw) return raw
          const width = element.getAttribute('width')
          const alignment =
            (element.getAttribute('data-alignment') as ImageAlignment | null) ?? 'center'
          return imageContainerStyle(alignment, width ? Number(width) : null)
        },
        renderHTML: (attributes) => {
          const style = attributes.containerStyle
            ? (attributes.containerStyle as string)
            : imageContainerStyle(
                (attributes.alignment as ImageAlignment | null) ?? 'center',
                attributes.width as number | null,
              )
          return { containerstyle: style }
        },
      },
    }
  },
})

/**
 * Add a `setImageAlignment` command to the image extension.
 * The stock image extension has no alignment command, so it is added here and
 * rewrites containerStyle so the wrapper follows the new alignment.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageAlignment: {
      setImageAlignment: (alignment: ImageAlignment) => ReturnType
    }
    imageOptions: {
      setImageWrapStyle: (mode: ImageWrapStyle) => ReturnType
      setImageWidth: (width: number | null) => ReturnType
    }
    imageCaption: {
      addImageCaption: () => ReturnType
    }
  }
}

const AlignedImageResize = CenteredImageResize.extend({
  addCommands() {
    return {
      // Keep the stock image commands (setImage, toggleImage, …) supplied by
      // the resize package extending @tiptap/extension-image.
      ...this.parent?.(),
      setImageAlignment:
        (alignment: ImageAlignment) =>
        ({ commands }) =>
          commands.updateAttributes('imageResize', {
            alignment,
            containerStyle: imageContainerStyle(alignment),
          }),
      /**
       * Apply a text-wrap mode to the selected image by rewriting its wrapper
       * style. An explicit width survives the change so size presets and wrap
       * modes compose instead of resetting each other.
       */
      setImageWrapStyle:
        (mode: ImageWrapStyle) =>
        ({ state, commands }) => {
          const node = selectedImageNode(state)
          if (!node) return false
          const width = readStyleWidth(node.attrs.containerStyle as string | null)
          return commands.updateAttributes('imageResize', {
            alignment: mode === 'wrap-left' || mode === 'wrap-right' ? 'float' : 'center',
            containerStyle: imageWrapStyle(mode, width),
            // Drives the CSS rules for modes the style sanitizer would strip.
            wrapMode: mode,
          })
        },
      /** Resize the selected image to an explicit pixel width (null = natural size). */
      setImageWidth:
        (width: number | null) =>
        ({ state, commands }) => {
          const node = selectedImageNode(state)
          if (!node) return false
          const current =
            typeof node.attrs.containerStyle === 'string' && node.attrs.containerStyle.length > 0
              ? node.attrs.containerStyle
              : imageContainerStyle('center', null)
          return commands.updateAttributes('imageResize', {
            containerStyle: withImageWidth(current, width),
          })
        },
      /**
       * Insert a caption paragraph directly below the selected image and mark
       * the image as captioned. The paragraph is tagged `style_source:
       * image_caption` so the behavioral model can learn the pairing; its
       * centered-italic treatment mirrors the "Caption" style tile.
       */
      addImageCaption:
        () =>
        ({ state, chain }) => {
          const { selection } = state
          const node =
            selection instanceof NodeSelection && selection.node.type.name === 'image'
              ? selection.node
              : undefined
          if (!node) return chain().run()
          const imagePos = selection.from
          const imageEnd = imagePos + node.nodeSize
          return chain()
            .setNodeSelection(imagePos)
            .updateAttributes('image', { caption: true })
            .insertContentAt(imageEnd, {
              type: 'paragraph',
              attrs: { styleSource: 'image_caption' },
            })
            .setTextSelection({ from: imageEnd + 1, to: imageEnd + 1 })
            .setTextAlign('center')
            .setFontSize('11pt')
            .toggleItalic()
            .run()
        },
    }
  },
})

/**
 * Table alignment (left / center / right) as a node attribute.
 * The stock TipTap table extension has no alignment command, so the attribute
 * is declared here and a `setTableAlignment` command is added below.
 */
const AlignedTable = TablePlus.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: {
        default: 'center',
        parseHTML: (element) =>
          (element.getAttribute('data-alignment') as TableAlignment | null) ?? 'center',
        renderHTML: (attributes) => {
          const value = attributes.alignment as TableAlignment | null
          if (!value || value === 'center') return {}
          return { 'data-alignment': value }
        },
      },
    }
  },
})

/**
 * Add a `setTableAlignment` command to the table extension.
 * Alignment is a table-level property, so it writes to the ancestor table node
 * rather than the current text position.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableAlignment: {
      setTableAlignment: (alignment: TableAlignment) => ReturnType
      equalizeTableColumns: () => ReturnType
    }
    academicTable: {
      setTableStylePreset: (preset: string) => ReturnType
      toggleHeaderRow: () => ReturnType
      toggleHeaderColumn: () => ReturnType
      autoFitToPage: () => ReturnType
      autoFitToContents: () => ReturnType
      mergeCells: () => ReturnType
      splitCell: () => ReturnType
      addRowBefore: () => ReturnType
      addRowAfter: () => ReturnType
      addColumnBefore: () => ReturnType
      addColumnAfter: () => ReturnType
      deleteRow: () => ReturnType
      deleteColumn: () => ReturnType
      deleteTable: () => ReturnType
      nextTableNumber: () => ReturnType
      setTableCaption: (caption: string) => ReturnType
    }
    academicImage: {
      setImageWrapMode: (wrapMode: string) => ReturnType
      nextFigureNumber: () => ReturnType
      setImageDimensions: (width: number | null, height: number | null) => ReturnType
    }
  }
}

const TableAlignmentExtension = AlignedTable.extend({
  addCommands() {
    return {
      // Keep the stock table commands (insertTable, addRowBefore, deleteRow,
      // header toggles, …): overriding addCommands drops them otherwise.
      ...this.parent?.(),
      setTableAlignment:
        (alignment: TableAlignment) =>
        ({ commands }) =>
          commands.updateAttributes('table', { alignment }),
      /**
       * Give every column in the current table the same width, keeping the
       * measured total width so the table does not jump on the page.
       * Widths are measured from the rendered cells: after a manual column
       * resize prosemirror-tables only stores `colwidth` on the dragged
       * column, so the authoritative layout lives in the DOM. Falls back to
       * explicit `colwidth` attributes when the DOM is unavailable.
       */
      equalizeTableColumns:
        () =>
        ({ state, tr, dispatch, view }) => {
          const { $from } = state.selection
          let tableDepth = -1
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === 'table') {
              tableDepth = depth
              break
            }
          }
          if (tableDepth < 0) return false
          const table = $from.node(tableDepth)
          const tablePos = $from.before(tableDepth)

          const dom = view.nodeDOM(tablePos)
          const firstRow = dom instanceof HTMLElement ? dom.querySelector('tr') : null
          let widths: number[] = []
          if (firstRow) {
            Array.from(firstRow.children).forEach((cell) => {
              const el = cell as HTMLElement
              const span = Math.max(1, Number(el.getAttribute('colspan')) || 1)
              const per = el.getBoundingClientRect().width / span
              for (let i = 0; i < span; i += 1) widths.push(per)
            })
          }
          if (widths.length === 0) {
            table.forEach((row) => {
              if (widths.length > 0) return
              const cols: number[] = []
              let complete = true
              row.forEach((cell) => {
                const cw = cell.attrs.colwidth as number[] | null
                if (cw && cw.length > 0) cols.push(cw.reduce((sum, w) => sum + w, 0))
                else complete = false
              })
              if (complete && cols.length > 0) widths = cols
            })
          }
          if (widths.length === 0) return false

          const total = widths.reduce((sum, w) => sum + w, 0)
          const base = Math.floor(total / widths.length)
          const remainder = total - base * widths.length
          const equal = widths.map((_, index) => Math.round(base + (index < remainder ? 1 : 0)))

          table.forEach((row, rowOffset) => {
            let column = 0
            row.forEach((cell, cellOffset) => {
              const span = cell.attrs.colspan as number
              const slice = equal.slice(column, column + span)
              column += span
              if (slice.length === 0) return
              tr.setNodeMarkup(tablePos + 1 + rowOffset + 1 + cellOffset, undefined, {
                ...cell.attrs,
                colwidth: slice,
              })
            })
          })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})

const CustomHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      styleSource: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-style-source'),
        renderHTML: (a) => (a.styleSource ? { 'data-style-source': a.styleSource } : {}),
      },
      /**
       * Marks a heading as the document title rather than a section heading.
       * Both are level 1 in the editor, so this is what lets a preset style
       * them differently: IEEE renders sections uppercase but the title in
       * title case. Defaults to null, so documents saved before this existed
       * keep their current appearance.
       */
      docRole: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-doc-role'),
        renderHTML: (a) => (a.docRole ? { 'data-doc-role': a.docRole } : {}),
      },
      /**
       * Inline style carried by an imported heading: its own size, vertical
       * spacing, alignment and indent. Without it a title page's big gaps and
       * sizes collapse into the editor's fixed heading rules. Choosing a style
       * from the toolbar clears it (see applyStyleCommand).
       */
      style: {
        default: null,
        parseHTML: (el) => filterStyle(el.getAttribute('style')),
        renderHTML: (a) => (a.style ? { style: a.style } : {}),
      },
      ...guideAttributes,
    }
  },
})

/**
 * Callout variants available in the editor.
 * A callout is a labelled blockquote, so it reuses the existing blockquote node
 * instead of introducing a new node type.
 */
const CALLOUT_VARIANTS = ['note', 'warning', 'key', 'example'] as const
type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]

/** Display label for each callout variant, shown in the callout's top-left. */
const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  note: 'Note',
  warning: 'Warning',
  key: 'Key Point',
  example: 'Example',
}

const CustomBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      /**
       * Which callout this blockquote represents, or null for a plain quote.
       * Rendered as data-callout so the saved HTML round-trips.
       */
      calloutType: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-callout'),
        // The label is stored alongside the variant because CSS attr() cannot
        // transform text, so the capitalised form has to live in the markup.
        renderHTML: (a) => {
          const variant = a.calloutType as CalloutVariant | null
          if (!variant || !CALLOUT_LABELS[variant]) return {}
          return {
            'data-callout': variant,
            'data-callout-label': CALLOUT_LABELS[variant],
          }
        },
      },
      styleSource: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-style-source'),
        renderHTML: (a) => (a.styleSource ? { 'data-style-source': a.styleSource } : {}),
      },
      ...guideAttributes,
    }
  },
  addCommands() {
    return {
      // Keep the parent blockquote commands (setBlockquote, toggleBlockquote,
      // unsetBlockquote): StarterKit disables its own blockquote, so dropping
      // them here removes Quote entirely.
      ...this.parent?.(),
      /**
       * Turn the current block into a callout of the given variant. Wraps in a
       * blockquote first when the selection is not already in one.
       */
      setCallout:
        (variant: CalloutVariant) =>
        ({ chain }) =>
          chain()
            .setBlockquote()
            .updateAttributes('blockquote', { calloutType: variant })
            .run(),
      /** Return a callout to an ordinary blockquote. */
      clearCallout:
        () =>
        ({ commands }) =>
          commands.updateAttributes('blockquote', { calloutType: null }),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant: CalloutVariant) => ReturnType
      clearCallout: () => ReturnType
    }
  }
}

export const editorExtensions = [
  StarterKit.configure({
    paragraph: false,
    heading: false,
    blockquote: false,
  }),
  CustomParagraph,
  CustomHeading,
  CustomBlockquote,
  PageBreak,
  PageFlowExtension,
  TabStop,
  HeaderFooterExtension,
  AcademicObjectsExtension,
  CaptionExtension,
  GeneratedBlockExtension,
  TextStyle,
  Color,
  FontFamily,
  FontSizeExtension,
  IndentExtension,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  AlignedImageResize.configure({ inline: false, allowBase64: true }),
  // table-plus draws its own column handles; prosemirror-tables' resizing
  // plugin would fight them, so stock resizing stays off.
  TableAlignmentExtension.configure({ resizable: false }),
  TableRowPlus,
  CustomTableCell,
  CustomTableHeader,
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  GrammarUnderlineExtension,
  SuggestionDecorationsExtension,
  BlueprintGuideExtension,
  HarperLinterExtension,
  StyleGuideExtension,
  MarkdownTriggers,
  ImageResizeBehaviorExtension,
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
const IMAGE_MENU_OPTIONS = { placement: 'bottom' } as const

/** Show the floating image toolbar only while an image is selected in an editable doc. */
function imageMenuShouldShow(props: { editor: Editor }): boolean {
  const { editor } = props
  return editor.isEditable && editor.isActive('imageResize')
}

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
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: active ? '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' : '1px solid transparent',
        backgroundColor: active ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
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
  maxHeight,
}: {
  children: ReactNode
  width?: number
  rightAligned?: boolean
  /** When set, the popover scrolls internally instead of growing past the viewport. */
  maxHeight?: number
}): JSX.Element {
  return (
    <div
      style={{
        ...POPOVER_STYLE,
        width,
        padding: '6px',
        ...(rightAligned ? { right: 0, left: 'auto' } : {}),
        ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
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

/** Preview typography rendered on a style tile. */
interface StyleTilePreview {
  fontSize?: string
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
}

interface StyleGalleryItem {
  format: string
  tag: string
  label: string
  preview: StyleTilePreview
}

/** Style-tile gallery: formats mapped to block tags for active highlighting. */
const STYLE_GALLERY: StyleGalleryItem[] = [
  { format: 'normal',     tag: 'p',          label: 'Normal',      preview: {} },
  { format: 'h1',         tag: 'h1',         label: 'Chapter heading', preview: { fontSize: '14px', fontWeight: 700 } },
  { format: 'h2',         tag: 'h2',         label: 'Section heading', preview: { fontSize: '13px', fontWeight: 700 } },
  { format: 'h3',         tag: 'h3',         label: 'Subsection heading', preview: { fontSize: '12px', fontWeight: 600 } },
  { format: 'title',      tag: 'h1',         label: 'Title',       preview: { fontSize: '15px', fontWeight: 700 } },
  { format: 'blockquote', tag: 'blockquote', label: 'Quote',       preview: { fontSize: '11px', fontStyle: 'italic' } },
  { format: 'caption',    tag: 'p',          label: 'Caption',     preview: { fontSize: '11px', fontStyle: 'italic' } },
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
  onFormatApplied?: (action: string, payload?: BehaviorEventPayload) => void
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
  /** Horizontal placement of the header line (left, center, right, split). */
  headerPlacement: HeaderFooterPlacement
  footerPlacement: HeaderFooterPlacement
  onHeaderPlacementChange: (value: HeaderFooterPlacement) => void
  onFooterPlacementChange: (value: HeaderFooterPlacement) => void
  /** Distance from the page edge to the header/footer, in inches. */
  headerMarginIn: number
  footerMarginIn: number
  onHeaderMarginChange: (value: number) => void
  onFooterMarginChange: (value: number) => void
  /** Omit headers/footers on the title page. */
  differentFirstPage: boolean
  onDifferentFirstPageChange: (value: boolean) => void
  documentTitle?: string
  onApplyStyle: (format: string) => void
  onApplyPreset: (key: string) => void
  activePreset: string | null
  /** IEEE-only: show two pages side by side as a connected spread. */
  spreadPreview?: boolean
  onSpreadPreviewChange?: (value: boolean) => void
  /** Visual canvas zoom (1 = 100%). Layout and pagination are unaffected. */
  zoomLevel?: number
  onZoomLevelChange?: (level: number) => void
  /** Show non-printing alignment gridlines over each page's text area. */
  showGridlines?: boolean
  onShowGridlinesChange?: (show: boolean) => void
  /** Page Setup field to open and focus when the request changes. */
  pageSetupFocusRequest?: 'header' | 'footer' | null
  /** Called after a focus request has been handled so the host can clear it. */
  onPageSetupFocusHandled?: () => void
  onOpenPersonalization?: () => void
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
  headerPlacement,
  footerPlacement,
  onHeaderPlacementChange,
  onFooterPlacementChange,
  headerMarginIn,
  footerMarginIn,
  onHeaderMarginChange,
  onFooterMarginChange,
  differentFirstPage,
  onDifferentFirstPageChange,
  documentTitle = 'Untitled Document',
  onApplyStyle,
  onApplyPreset,
  activePreset,
  spreadPreview = false,
  onSpreadPreviewChange,
  zoomLevel = 1,
  onZoomLevelChange,
  showGridlines = false,
  onShowGridlinesChange,
  pageSetupFocusRequest = null,
  onPageSetupFocusHandled,
  onOpenPersonalization,
}: ToolbarProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'home' | 'insert' | 'styles'>('home')
  const [openFont, setOpenFont] = useState(false)
  const [openSize, setOpenSize] = useState(false)
  const [openColor, setOpenColor] = useState(false)
  const [openHighlight, setOpenHighlight] = useState(false)
  const [openTableMenu, setOpenTableMenu] = useState(false)
  const [openImageMenu, setOpenImageMenu] = useState(false)
  const [openCalloutMenu, setOpenCalloutMenu] = useState(false)
  const [openPageSetup, setOpenPageSetup] = useState(false)
  const [spaceBefore, setSpaceBefore] = useState(0)
  const [spaceAfter, setSpaceAfter] = useState(0)
  const [openExport, setOpenExport] = useState(false)
  const [ieeePreviewHtml, setIeeePreviewHtml] = useState<string | null>(null)
  const [columnsDraft, setColumnsDraft] = useState(false)

  /** Flips the IEEE two-column draft view: pagination off + columns on, or back. */
  const toggleColumnsDraft = (): void => {
    if (!editor) return
    const next = !columnsDraft
    if (next) {
      editor.commands.disablePagination()
    } else {
      editor.commands.enablePagination()
    }
    editor.commands.setColumnsDraft(next)
    setColumnsDraft(next)
  }
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const headerInputRef = useRef<HTMLInputElement>(null)
  const footerInputRef = useRef<HTMLInputElement>(null)

  // Re-render on every TipTap transaction so active/disabled states stay fresh.
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  // Report image resizes for behavior tracking. Assigned to per-editor storage
  // because the shared extension array is built once at module scope, so the
  // handler cannot be passed as a static extension option.
  useEffect(() => {
    if (!editor) return
    editor.storage.imageResizeBehavior.onResize = (report) => {
      onFormatApplied?.('image_resize', {
        contextNode: 'image',
        imageWidth: report.width,
        imageHeight: report.height,
        imageAlignment: report.alignment,
      })
    }
    return () => {
      editor.storage.imageResizeBehavior.onResize = null
    }
  }, [editor, onFormatApplied])

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
    setOpenFont(false)
    setOpenSize(false)
    setOpenColor(false)
    setOpenHighlight(false)
    setOpenTableMenu(false)
    setOpenImageMenu(false)
    setOpenPageSetup(false)
    setOpenExport(false)
  }

  // Canvas double-click requests (Bug 3): open Page Setup and focus the
  // header or footer text field the user double-clicked on the page.
  useEffect(() => {
    if (!pageSetupFocusRequest) return
    closeAllMenus()
    setOpenPageSetup(true)
    const timer = setTimeout(() => {
      const input = pageSetupFocusRequest === 'header' ? headerInputRef.current : footerInputRef.current
      input?.focus()
      input?.select()
      onPageSetupFocusHandled?.()
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSetupFocusRequest, onPageSetupFocusHandled])

  /**
   * Run a TipTap command and report the action for behavior tracking.
   * `payload` carries structured-object context (table shape, image size) for
   * the full-spectrum learning pipeline. Pass a function to snapshot the editor
   * AFTER the command runs, which is what structural actions need: a
   * table_row_add should record the resulting size, not the previous one.
   */
  function run(
    actionName: string,
    command: () => void,
    payload?: BehaviorEventPayload | (() => BehaviorEventPayload | undefined)
  ): void {
    command()
    const resolved = typeof payload === 'function' ? payload() : payload
    onFormatApplied?.(actionName, resolved)
  }

  /** Table dimensions for the table containing the selection, if any. */
  function tableShapePayload(): BehaviorEventPayload | undefined {
    const shape = editor ? snapshotTableShape(editor) : undefined
    return shape ? { contextNode: 'table', ...shape } : undefined
  }

  /**
   * Full table context, snapshotted after the command runs so a header toggle
   * reports the header state it produced rather than the previous one.
   */
  function tableContextPayload(): BehaviorEventPayload | undefined {
    const context = editor ? snapshotTableContext(editor) : undefined
    return context ? { contextNode: 'table', ...context } : undefined
  }

  /** Image context for the image toolbar actions, snapshotted after the command. */
  function imageContextPayload(): BehaviorEventPayload | undefined {
    const context = editor ? snapshotImageContext(editor) : undefined
    return context ? { contextNode: 'image', ...context } : undefined
  }

  /**
   * Live table context for the toolbar: drives the header-toggle and alignment
   * labels. Read during render, after the transaction, so the menu reflects the
   * current selection rather than the state before the last action.
   */
  const tableContext = useMemo(
    () => (editor ? snapshotTableContext(editor) : undefined),
    [editor, editor?.state]
  )

  /** Live image context for the toolbar: drives the alignment and caption labels. */
  const imageContext = useMemo(
    () => (editor ? snapshotImageContext(editor) : undefined),
    [editor, editor?.state]
  )

  /** The callout variant of the blockquote the cursor is in, if any. */
  const currentCallout = useMemo<CalloutVariant | null>(() => {
    if (!editor || editor.isDestroyed) return null
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)
      if (node.type.name === 'blockquote' && node.attrs.calloutType) {
        return node.attrs.calloutType as CalloutVariant
      }
    }
    return null
  }, [editor, editor?.state])

  /**
   * Indenting inside a blockquote is reported as the structural action
   * blockquote_indent so the model can learn it separately from list nesting.
   */
  function indentActionName(base: 'indent' | 'outdent'): string {
    if (base === 'indent' && editor && !editor.isDestroyed && editor.isActive('blockquote')) {
      return 'blockquote_indent'
    }
    return base
  }

  /**
   * Insert an image and report its real pixel size to the behavior pipeline.
   * The image is preloaded first because a freshly inserted node has no
   * measured size yet, and the dimensions are what the ML features learn from.
   * A failed or cross-origin-blocked load still inserts the image and reports
   * the action without dimensions.
   */
  function insertImageFromUrl(url: string): void {
    const insert = (payload: BehaviorEventPayload): void => {
      run('insert_image', () => editor?.chain().focus().setImage({ src: url }).run(), payload)
    }

    const probe = new Image()
    probe.onload = () => {
      insert({
        contextNode: 'image',
        imageWidth: probe.naturalWidth || undefined,
        imageHeight: probe.naturalHeight || undefined,
      })
    }
    probe.onerror = () => insert({ contextNode: 'image' })
    probe.src = url
  }

  /**
   * Insert a picked image file: upload it to storage and insert the returned
   * URL; if the upload fails (offline, storage error), fall back to embedding
   * the file as a data URL so the image is never lost.
   */
  async function handleImageFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const url = await api.documents.uploadImage(file)
      insertImageFromUrl(url)
      return
    } catch {
      /* fall through to the local data-URL fallback */
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => reject(new Error('Image read failed'))
        reader.readAsDataURL(file)
      })
      if (dataUrl) insertImageFromUrl(dataUrl)
    } catch {
      window.alert('Could not read or upload this image. Please try another file.')
    }
  }

  /** Blockquote context for a structural indent, when applicable. */
  function blockquoteContextPayload(): BehaviorEventPayload | undefined {
    if (!editor || editor.isDestroyed || !editor.isActive('blockquote')) return undefined
    return { contextNode: 'blockquote' }
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
        const content = clampImageWidthsInHtml(
          importedDoc.content,
          printableWidthPx(importedDoc.page_size, importedDoc.margins)
        )
        editor.commands.setContent(content, { emitUpdate: true })
        onImportComplete?.(content, importedDoc.title, {
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
            editor.commands.setContent(
              clampImageWidthsInHtml(result, printableWidthPx(pageSize, margins)),
              { emitUpdate: true }
            )
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
      className="intellidocs-toolbar"
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

      {/* Modern ribbon tab strip: Home | Insert | Styles */}
      <div className="flex items-center gap-1.5 w-full pb-2 mb-2 border-b border-border/60">
        {(['home', 'insert', 'styles'] as const).map((tabName) => (
          <button
            key={tabName}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              closeAllMenus()
              setActiveTab(tabName)
            }}
            title={tabName === 'home' ? 'Text editing and formatting' : tabName === 'insert' ? 'Insert content into the document' : 'Styles and academic presets'}
            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all capitalize ${
              activeTab === tabName
                ? 'bg-primary/10 text-primary shadow-xs'
                : 'bg-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            {tabName}
          </button>
        ))}
      </div>

      {/* Home tab — text editing and formatting */}
      <div
        style={{
          display: activeTab === 'home' ? 'contents' : 'none',
        }}
      >
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

      {/* Styles gallery — Word-style inline tiles with More popover */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            overflowX: 'auto',
            maxWidth: '400px',
            scrollbarWidth: 'none',
          }}
        >
          {STYLE_GALLERY.map((item) => {
            const active = currentBlockTag === item.tag
            return (
              <button
                key={item.format}
                type="button"
                disabled={!editor}
                title={item.label}
                onClick={() =>
                  run(`style_${item.format}`, () => onApplyStyle?.(item.format))
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '30px',
                  padding: '0 9px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                  boxShadow: active ? 'inset 0 -2px 0 0 var(--accent-strong)' : 'none',
                  color: 'var(--foreground)',
                  fontSize: item.preview.fontSize ?? '12px',
                  fontStyle: item.preview.fontStyle ?? 'normal',
                  fontWeight: item.preview.fontWeight ?? 500,
                  cursor: editor ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  opacity: editor ? 1 : 0.4,
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
              </button>
            )
          })}
        </div>
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
              width: '24px',
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
              width: '24px',
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
        {basePresetKey(activePreset) === 'ieee' && (
          <ToolButton
            icon={Hash}
            title="Renumber IEEE headings (I. II. A. 1))"
            disabled={!editor || editor.isEmpty}
            onClick={() =>
              run('ieee_numbering', () => {
                if (editor) {
                  applyIeeeNumbering(editor)
                }
              })
            }
          />
        )}
        {basePresetKey(activePreset) === 'ieee' && (
          <ToolButton
            icon={LayoutTemplate}
            title="Restructure into IEEE format"
            disabled={!editor || editor.isEmpty}
            onClick={() => {
              if (!editor) {
                return
              }
              const confirmed = window.confirm(
                'Restructure this document into IEEE format?\n\n' +
                  'Sections whose headings match an IEEE section keep their content. ' +
                  'IEEE sections with no match are added blank for you to fill in.\n\n' +
                  'Nothing is deleted: anything that matches no IEEE section is moved ' +
                  'to the end under an "Unmapped Content" heading.'
              )
              if (confirmed) {
                run('ieee_convert', () => convertToIeee(editor))
              }
            }}
          />
        )}
        {basePresetKey(activePreset) === 'ieee' && (
          <>
            <ToolButton
              icon={Printer}
              title="Exact IEEE print preview (two columns, PDF)"
              onClick={() => setIeeePreviewHtml(editor?.getHTML() ?? '')}
            />
            <ToolButton
              icon={Columns}
              title={
                columnsDraft
                  ? 'Back to paged view'
                  : 'Two-column draft (one long sheet, pagination off)'
              }
              active={columnsDraft}
              onClick={() => toggleColumnsDraft()}
            />
          </>
        )}
        {ieeePreviewHtml !== null && (
          <IeeePrintPreview html={ieeePreviewHtml} onClose={() => setIeeePreviewHtml(null)} />
        )}
        {basePresetKey(activePreset) === 'ieee' && onSpreadPreviewChange && (
          <ToolButton
            icon={BookOpen}
            title={
              spreadPreview
                ? 'Single page view'
                : 'Two page spread view (pages 1|2, 3|4)'
            }
            active={spreadPreview}
            onClick={() => onSpreadPreviewChange(!spreadPreview)}
          />
        )}
        <ToolButton
          icon={Outdent}
          title="Outdent"
          onClick={() =>
            run('outdent', () => editor?.chain().focus().outdent().run(), blockquoteContextPayload)
          }
        />
        <ToolButton
          icon={Indent}
          title="Indent"
          onClick={() =>
            run(indentActionName('indent'), () => editor?.chain().focus().indent().run())
          }
        />
      </div>

      <Divider />

      {/* Clear formatting lives in the Home tab */}
      <div style={GROUP_STYLE}>
        <ToolButton
          icon={RotateCcw}
          title="Clear Formatting"
          onClick={() =>
            run('clear_formatting', () => editor?.chain().focus().unsetAllMarks().clearNodes().run())
          }
        />
      </div>
      </div>

      {/* Insert tab — content that gets added to the document */}
      <div
        style={{
          display: activeTab === 'insert' ? 'contents' : 'none',
        }}
      >
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
            <Popover width={240} maxHeight={420}>
              <MenuItem
                onClick={() => {
                  closeAllMenus()
                  run(
                    'insert_table',
                    () =>
                      editor
                        ?.chain()
                        .focus()
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run(),
                    { contextNode: 'table', tableRows: 3, tableCols: 3, tableHasHeader: true }
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
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Style Presets */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Style Presets
                  </div>
                  {(['apa-three-line', 'ieee-grid', 'shaded-header', 'borderless', 'minimal'] as AcademicTableStyle[]).map((preset) => (
                    <MenuItem
                      key={preset}
                      active={tableContext?.tableStylePreset === preset}
                      onClick={() => {
                        closeAllMenus()
                        run('table_style_preset', () => editor?.chain().focus().setTableStylePreset(preset).run(), tableContextPayload)
                      }}
                    >
                      {preset.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </MenuItem>
                  ))}
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Rows & Columns */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Rows & Columns
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_row_add_before', () => editor?.chain().focus().addRowBefore().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Add Row Above
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_row_add_after', () => editor?.chain().focus().addRowAfter().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Add Row Below
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_col_add_before', () => editor?.chain().focus().addColumnBefore().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Add Column Left
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_col_add_after', () => editor?.chain().focus().addColumnAfter().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Add Column Right
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_row_delete', () => editor?.chain().focus().deleteRow().run(), tableShapePayload)
                    }}
                  >
                    Delete Row
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_col_delete', () => editor?.chain().focus().deleteColumn().run(), tableShapePayload)
                    }}
                  >
                    Delete Column
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Cell Operations */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Cell Operations
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_merge_cells', () => editor?.chain().focus().mergeCells().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Merge style={{ width: '14px', height: '14px' }} />
                      Merge Cells
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_split_cell', () => editor?.chain().focus().splitCell().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <SplitSquare style={{ width: '14px', height: '14px' }} />
                      Split Cell
                    </span>
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Headers */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Headers
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_header_row_toggle', () => editor?.chain().focus().toggleHeaderRow().run(), tableContextPayload)
                    }}
                    active={tableContext?.tableHasHeaderRow}
                  >
                    Toggle Header Row
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_header_col_toggle', () => editor?.chain().focus().toggleHeaderColumn().run(), tableContextPayload)
                    }}
                    active={tableContext?.tableHasHeaderColumn}
                  >
                    Toggle Header Column
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Auto-fit */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Auto-fit
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_autofit_page', () => editor?.chain().focus().autoFitToPage().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Maximize2 style={{ width: '14px', height: '14px' }} />
                      Fit to Page Width
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_autofit_contents', () => editor?.chain().focus().autoFitToContents().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Minimize2 style={{ width: '14px', height: '14px' }} />
                      Auto-fit to Contents
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_equalize_columns', () => editor?.chain().focus().equalizeTableColumns().run(), tableShapePayload)
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Columns style={{ width: '14px', height: '14px' }} />
                      Equalize Columns
                    </span>
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Cell Styling */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Cell Styling
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      // Open color picker for cell background
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <PaletteIcon style={{ width: '14px', height: '14px' }} />
                      Cell Background Color
                    </span>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Type style={{ width: '14px', height: '14px' }} />
                      Cell Text Alignment
                    </span>
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  {/* Table Properties */}
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Table Properties
                  </div>
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      const next: TableAlignment =
                        tableContext?.tableAlignment === 'left' ? 'center' : 'left'
                      run('table_alignment_change', () => editor?.chain().focus().setTableAlignment(next).run(), tableContextPayload)
                    }}
                  >
                    {tableContext?.tableAlignment === 'left' ? 'Align Center' : 'Align Left'}
                  </MenuItem>
                  {tableContext?.tableAlignment === 'left' && (
                    <MenuItem
                      onClick={() => {
                        closeAllMenus()
                        run('table_alignment_change', () => editor?.chain().focus().setTableAlignment('right').run(), tableContextPayload)
                      }}
                    >
                      Align Right
                    </MenuItem>
                  )}
                  <MenuItem
                    onClick={() => {
                      closeAllMenus()
                      run('table_caption_add', () => editor?.chain().focus().insertCaption('table').run(), tableContextPayload)
                    }}
                  >
                    Add numbered caption
                  </MenuItem>
                  <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                  <MenuItem
                    onClick={() => { closeAllMenus(); editor?.chain().focus().deleteTable().run() }}
                    style={{ color: 'var(--destructive)' }}
                  >
                    Delete Table
                  </MenuItem>
                </>
              )}
            </Popover>
          )}
        </div>

        {/* Callouts: a labelled blockquote variant, reported as callout_insert. */}
        <div style={{ position: 'relative' }}>
          <ToolButton
            icon={BadgeInfo}
            title="Callout"
            active={editor?.isActive('blockquote') && Boolean(currentCallout)}
            onClick={() => setOpenCalloutMenu((v) => !v)}
          />
          {openCalloutMenu && (
            <Popover width={180}>
              {CALLOUT_VARIANTS.map((variant) => (
                <MenuItem
                  key={variant}
                  onClick={() => {
                    closeAllMenus()
                    run(
                      'callout_insert',
                      () => editor?.chain().focus().setCallout(variant).run(),
                      { contextNode: 'callout', blockType: variant }
                    )
                  }}
                >
                  {CALLOUT_LABELS[variant]}
                </MenuItem>
              ))}
              {currentCallout && (
                <MenuItem
                  onClick={() => {
                    closeAllMenus()
                    run('callout_insert', () => editor?.chain().focus().clearCallout().run(), {
                      contextNode: 'blockquote',
                    })
                  }}
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Remove Callout
                </MenuItem>
              )}
            </Popover>
          )}
        </div>

        <ToolButton
          icon={ImageIcon}
          title="Insert Image"
          onClick={() => imageInputRef.current?.click()}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleImageFileSelected(e)
          }}
        />

{/* Image alignment only makes sense with an image selected. */}
        {imageContext && (
          <div style={{ position: 'relative' }}>
            <ToolButton
              icon={AlignCenter}
              title={`Image Alignment: ${imageContext.imageAlignment}`}
              onClick={() => setOpenImageMenu((v) => !v)}
            />
            {openImageMenu && (
              <Popover width={220}>
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Alignment
                </div>
                {(['left', 'center', 'right', 'float'] as ImageAlignment[]).map((value) => (
                  <MenuItem
                    key={value}
                    onClick={() => {
                      closeAllMenus()
                      setOpenImageMenu(false)
                      setOpenCalloutMenu(false)
                      run('image_alignment', () => editor?.chain().focus().setImageAlignment(value).run(), imageContextPayload)
                    }}
                    style={
                      imageContext.imageAlignment === value
                        ? { fontWeight: 600, color: 'var(--primary)' }
                        : undefined
                    }
                  >
                    <span style={{ textTransform: 'capitalize' }}>{value}</span>
                  </MenuItem>
                ))}
                <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Text Wrapping
                </div>
                {(['inline', 'square', 'tight', 'top-bottom', 'behind', 'in-front'] as ImageWrapMode[]).map((value) => (
                  <MenuItem
                    key={value}
                    onClick={() => {
                      closeAllMenus()
                      run('image_wrap_mode', () => editor?.chain().focus().setImageWrapMode(value).run(), imageContextPayload)
                    }}
                    style={
                      imageContext.imageWrapMode === value
                        ? { fontWeight: 600, color: 'var(--primary)' }
                        : undefined
                    }
                  >
                    <span style={{ textTransform: 'capitalize' }}>{value.replace('-', ' ')}</span>
                  </MenuItem>
                ))}
                <hr style={{ margin: '4px 0', borderColor: 'var(--border)' }} />
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Figure Properties
                </div>
                <MenuItem
                  onClick={() => {
                    closeAllMenus()
                    setOpenImageMenu(false)
                    run('image_caption_add', () => editor?.chain().focus().insertCaption('figure').run(), imageContextPayload)
                  }}
                >
                  Add numbered caption
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    closeAllMenus()
                    const width = prompt('Enter width (px):')
                    const height = prompt('Enter height (px):')
                    if (width && height) {
                      const clamped = Math.min(parseInt(width), printableWidthPx(pageSize, margins))
                      run('image_dimensions', () => editor?.chain().focus().setImageDimensions(clamped, parseInt(height)).run(), imageContextPayload)
                    }
                  }}
                >
                  Set Dimensions
                </MenuItem>
              </Popover>
            )}
          </div>
        )}

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
      </div>
      </div>

      {/* Styles tab — document styles and academic presets in one nav strip */}
      {activeTab === 'styles' && (
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          <EditorStylesPanel
            editor={editor}
            onApplyStyle={onApplyStyle}
            onApplyPreset={onApplyPreset}
            activePreset={activePreset}
          />
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Page setup */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            const next = !openPageSetup
            closeAllMenus()
            if (next && editor) {
              const style = editor.getAttributes('paragraph').style as string | null
              setSpaceBefore(parseMarginPt(style, 'margin-top'))
              setSpaceAfter(parseMarginPt(style, 'margin-bottom'))
            }
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
          <span>Page setup</span>
          <ChevronDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
        </button>

        {openPageSetup && (
          <Popover width={300} rightAligned maxHeight={440}>
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
                  Paragraph Spacing (PT)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'Before', value: spaceBefore, setValue: setSpaceBefore },
                    { label: 'After', value: spaceAfter, setValue: setSpaceAfter },
                  ].map((row) => (
                    <div
                      key={row.label}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{row.label}:</span>
                      <input
                        type="number"
                        min={0}
                        max={72}
                        step={2}
                        value={row.value}
                        onChange={(e) => {
                          const parsed = Math.min(72, Math.max(0, Number(e.target.value) || 0))
                          const before = row.label === 'Before' ? parsed : spaceBefore
                          const after = row.label === 'After' ? parsed : spaceAfter
                          row.setValue(parsed)
                          // No `.focus()` here: the command applies to the stored
                          // selection, and focusing would blur the number input.
                          editor?.chain().setParagraphSpacing(before, after).run()
                        }}
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
                  View
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Gridlines</span>
                  <button
                    type="button"
                    onClick={() => onShowGridlinesChange?.(!showGridlines)}
                    style={{
                      height: '24px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      border: 'none',
                      ...SHADOW_BORDER,
                      backgroundColor: showGridlines ? 'var(--primary)' : 'transparent',
                      color: showGridlines ? 'var(--primary-foreground)' : 'var(--foreground)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {showGridlines ? 'On' : 'Off'}
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Zoom</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0.5, 0.75, 1].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onZoomLevelChange?.(level)}
                        style={{
                          height: '24px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          border: 'none',
                          ...SHADOW_BORDER,
                          backgroundColor: zoomLevel === level ? 'var(--primary)' : 'transparent',
                          color: zoomLevel === level ? 'var(--primary-foreground)' : 'var(--foreground)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {`${Math.round(level * 100)}%`}
                      </button>
                    ))}
                  </div>
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
                      ref={headerInputRef}
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
                  <PlacementSelect
                    value={headerPlacement}
                    onChange={onHeaderPlacementChange}
                    disabled={!showHeader}
                  />
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
                      ref={footerInputRef}
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
                  <PlacementSelect
                    value={footerPlacement}
                    onChange={onFooterPlacementChange}
                    disabled={!showFooter}
                  />
                </div>

                {/* Distance from the page edge + title-page differentiation */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Header at:</span>
                    <input
                      type="number"
                      min={0.25}
                      max={2}
                      step={0.25}
                      value={headerMarginIn}
                      title="Distance from the page's top edge to the header, in inches"
                      onChange={(e) =>
                        onHeaderMarginChange(Math.min(2, Math.max(0.25, parseFloat(e.target.value) || 0.5)))
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
                  <div
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Footer at:</span>
                    <input
                      type="number"
                      min={0.25}
                      max={2}
                      step={0.25}
                      value={footerMarginIn}
                      title="Distance from the page's bottom edge to the footer, in inches"
                      onChange={(e) =>
                        onFooterMarginChange(Math.min(2, Math.max(0.25, parseFloat(e.target.value) || 0.5)))
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
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={differentFirstPage}
                    onChange={(e) => onDifferentFirstPageChange(e.target.checked)}
                    style={{ width: '12px', height: '12px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  Different first page (no header/footer on the title page)
                </label>
              </div>
            </div>
          </Popover>
        )}
      </div>

      {/* Personalization profile export/import */}
      {onOpenPersonalization && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              closeAllMenus()
              onOpenPersonalization()
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
            title="Export or import your personalization profile (.idocprofile)"
          >
            <UserCog style={{ width: '14px', height: '14px', opacity: 0.7 }} />
            <span>Personalization</span>
          </button>
        </div>
      )}

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

              {basePresetKey(activePreset) === 'ieee' ? (
                <MenuItem
                  onClick={() => {
                    setOpenExport(false)
                    if (editor) void exportIeeeDocx(editor.getHTML(), documentTitle)
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                    <span>IEEE paper (Word)</span>
                  </span>
                </MenuItem>
              ) : (
                <MenuItem
                  onClick={() => {
                    setOpenExport(false)
                    if (editor) exportThesisWord(editor.getHTML(), documentTitle)
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GraduationCap style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                    <span>Thesis Word (1.5&Prime; binding)</span>
                  </span>
                </MenuItem>
              )}

              <MenuItem
                onClick={() => {
                  setOpenExport(false)
                  if (editor) exportThesisPdf(editor.getHTML(), documentTitle)
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                  <span>Defense-Ready PDF</span>
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

// ─── Header/footer placement selector ───────────────────────────────────────

interface PlacementSelectProps {
  value: HeaderFooterPlacement
  onChange: (value: HeaderFooterPlacement) => void
  disabled?: boolean
}

/** Segmented control for header/footer placement: Left / Center / Right / Split. */
function PlacementSelect({ value, onChange, disabled = false }: PlacementSelectProps): JSX.Element {
  const options: HeaderFooterPlacement[] = ['left', 'center', 'right', 'split']
  return (
    <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          disabled={disabled}
          title={
            option === 'split'
              ? 'Text left, page number right'
              : `Place all content ${option === 'center' ? 'in the center' : `to the ${option}`}`
          }
          style={{
            flex: 1,
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            ...SHADOW_BORDER,
            backgroundColor: value === option ? 'var(--primary)' : 'transparent',
            color: value === option ? 'var(--primary-foreground)' : 'var(--foreground)',
            fontSize: '11px',
            textTransform: 'capitalize',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: disabled ? 0.45 : 1,
          }}
        >
          {option}
        </button>
      ))}
    </div>
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

/** Floating image options toolbar anchored below the selected image. */
function TiptapImageToolbar({ editor }: { editor: Editor | null }): JSX.Element | null {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  if (!editor) return null

  return (
    <BubbleMenu editor={editor} options={IMAGE_MENU_OPTIONS} shouldShow={imageMenuShouldShow}>
      <ImageOptionsToolbar editor={editor} />
    </BubbleMenu>
  )
}

/** Quick-insert toolbar shown at the start of an empty paragraph. */
function TiptapFloatingMenu({
  editor,
  onFormatApplied,
}: {
  editor: Editor | null
  onFormatApplied?: (action: string, payload?: BehaviorEventPayload) => void
}): JSX.Element | null {
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
          onClick={() => {
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
            onFormatApplied?.('insert_table', {
              contextNode: 'table',
              tableRows: 3,
              tableCols: 3,
              tableHasHeader: true,
            })
          }}
        />
        <ToolButton
          icon={Code2}
          title="Code Block"
          onClick={() => {
            editor.chain().focus().toggleCodeBlock().run()
            onFormatApplied?.('code_block_insert', { contextNode: 'code_block' })
          }}
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
    color: var(--text-primary);
    word-wrap: break-word;
    caret-color: var(--text-primary);
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
  /* Editor default spacing for typed text. Deliberately NOT !important: an
     imported paragraph carries its own resolved line-height/margins inline
     (Word style chain + docDefaults) and inline styles must win, or every
     import is flattened to this 1.5 spacing. */
  .ProseMirror p { margin-bottom: 0.25em; line-height: 1.5; }
  .ProseMirror p:empty, .ProseMirror p > br:only-child { min-height: 0.6em; display: block; width: 100%; margin-bottom: 0; }
  /* Document title: a heading carrying the title role rather than acting as a
     level 1 section. Size and weight are inherited from the h1 rule; only the
     centring is added here. An active preset supplies its own title rule. */
  .ProseMirror h1[data-doc-role='title'] { text-align: center; }
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
    margin: 0;
    line-height: 1.35;
  }
  /* Anchor the prosemirror-tables resize handle to the cell it resizes. */
  .ProseMirror td, .ProseMirror th { position: relative; }
  .ProseMirror .column-resize-handle {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: -2px;
    width: 4px;
    background-color: var(--primary);
    opacity: 0.8;
    pointer-events: none;
    z-index: 12;
  }
  /* Horizontal scroll wrapper prosemirror-tables injects around wide tables. */
  .ProseMirror .tableWrapper { overflow-x: auto; }
  .ProseMirror.resize-cursor { cursor: col-resize; }
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
  .ProseMirror ::selection { background: color-mix(in srgb, var(--selection) 60%, transparent); }
  .ProseMirror .ProseMirror-selectednode { outline: 2px solid var(--primary); outline-offset: 2px; }
  /* Suppress the ProseMirror selection outline on images — the library handles its own */
  .ProseMirror [data-resize-image-ui] { outline: none !important; }
  .ProseMirror-selectednode:has([data-resize-image-ui]) { outline: none !important; }
  /* The library's three-icon margin controller is superseded by the floating
     Image Options toolbar — hide it so the two do not stack. */
  .ProseMirror [data-resize-image-ui="position-controller"] { display: none !important; }
  /* Text-wrap modes the library's style sanitizer cannot express (it strips
     clear / position / z-index / opacity from containerStyle): the mode is
     tagged on the img node (the node view writes the attribute lowercased)
     and these rules style the image wrapper. */
  .ProseMirror div:has(> img[wrapmode='break']),
  .ProseMirror div:has(> img[data-wrap-mode='break']) { clear: both; }
  .ProseMirror div:has(> img[wrapmode='behind-text']),
  .ProseMirror div:has(> img[data-wrap-mode='behind-text']) { opacity: 0.82; }
  .ProseMirror div:has(> img[wrapmode='in-front']),
  .ProseMirror div:has(> img[data-wrap-mode='in-front']) {
    position: relative;
    z-index: 30;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .ProseMirror [data-resize-image-ui="resize-handle"] {
    width: 10px;
    height: 10px;
    background: var(--primary, var(--accent-strong));
    border: 2px solid var(--primary-foreground);
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
    text-decoration-color: var(--error);
  }
  .ProseMirror .grammar-issue.grammar-straight.grammar-kind-spelling {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    text-decoration-color: var(--warning);
  }
  .ProseMirror .grammar-issue.grammar-wavy.grammar-kind-grammar {
    text-decoration: underline wavy var(--error);
  }
  .ProseMirror .grammar-issue.grammar-wavy.grammar-kind-spelling {
    text-decoration: underline wavy var(--warning);
  }
  .ProseMirror .grammar-issue:hover {
    background-color: color-mix(in srgb, var(--error) 8%, transparent);
  }
  .ProseMirror .harper-underline {
    text-decoration: underline;
    text-decoration-skip-ink: none;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
    text-decoration-color: var(--grammar);
  }
`

// ─── Canvas component ───────────────────────────────────────────────────────

interface TiptapCanvasProps {
  editor: Editor | null
  onFormatApplied?: (action: string, payload?: BehaviorEventPayload) => void
}

/**
 * Renders the TipTap editor canvas with bubble + floating menus and prose styles.
 * Document.tsx places this inside the paper sheet.
 */
export function TiptapCanvas({ editor, onFormatApplied }: TiptapCanvasProps): JSX.Element {
  return (
    <>
      <style>{PROSE_STYLES}</style>
      <TiptapBubbleMenu editor={editor} />
      <TiptapImageToolbar editor={editor} />
      <TiptapFloatingMenu editor={editor} onFormatApplied={onFormatApplied} />
      {editor && <EditorContent editor={editor} />}
    </>
  )
}

/** Re-export Editor type so consumers import from this single file. */
export type { Editor }
