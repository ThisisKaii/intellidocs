import { useEffect, useRef } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { PaginationPlus } from 'tiptap-pagination-plus'
import {
  editorExtensions,
  TiptapCanvas,
  PAGE_SIZES,
  type PageSizeKey,
  type PageOrientation,
  type MarginValues,
} from './TiptapEditor'
import type { GrammarIssue } from './GrammarPanel'
import type { PageNumberFormat } from '@/services/api'

/** Vertical gap between stacked page sheets, in px. */
const PAGE_GAP = 40

/** Convert inches to pixels at 96 dpi. */
function inToPx(inches: number): number {
  return Math.round(inches * 96)
}

/**
 * The `{page}` placeholder token used by tiptap-pagination-plus in header and
 * footer content. Roman numerals are handled by a CSS counter override in
 * PagedEditor, not by this token.
 */
function pageNumberToken(format: PageNumberFormat): string {
  return format === 'none' ? '' : '{page}'
}

interface PagedEditorProps {
  /** Full document HTML — the single source of truth. */
  content: string
  /** Called with the full document HTML after any editor update. */
  onContentChange: (html: string) => void
  /** Called with the live editor once it exists. */
  onActiveEditorChange: (editor: Editor | null) => void
  /** Forwarded grammar-underline clicks for the popover. */
  onGrammarClick: (issue: GrammarIssue, rect: DOMRect) => void
  /** Grammar issues to underline in the editor. */
  grammarIssues: GrammarIssue[]
  pageSize: PageSizeKey
  margins: MarginValues
  orientation: PageOrientation
  showHeader: boolean
  showFooter: boolean
  headerContent: string
  footerContent: string
  headerNumberFormat: PageNumberFormat
  footerNumberFormat: PageNumberFormat
}

/**
 * The whole document as a single TipTap editor paginated by the
 * tiptap-pagination-plus extension. Page breaks, headers, footers and margins
 * are computed by the extension from the configured page geometry; layout
 * prop changes are applied through its update commands.
 */
export function PagedEditor({
  content,
  onContentChange,
  onActiveEditorChange,
  onGrammarClick,
  grammarIssues,
  pageSize,
  margins,
  orientation,
  showHeader,
  showFooter,
  headerContent,
  footerContent,
  headerNumberFormat,
  footerNumberFormat,
}: PagedEditorProps): JSX.Element {
  const propsRef = useRef({ onContentChange, onGrammarClick })
  propsRef.current = { onContentChange, onGrammarClick }
  const lastEmittedRef = useRef<string | null>(null)

  const preset = PAGE_SIZES[pageSize]
  const page =
    orientation === 'landscape'
      ? { label: preset.label, width: preset.height, height: preset.width }
      : preset
  const topPx = inToPx(margins.top)
  const bottomPx = inToPx(margins.bottom)
  const leftPx = inToPx(margins.left)
  const rightPx = inToPx(margins.right)

  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      PaginationPlus.configure({
        enabled: true,
        pageWidth: page.width,
        pageHeight: page.height,
        marginTop: topPx,
        marginBottom: bottomPx,
        marginLeft: leftPx,
        marginRight: rightPx,
        pageGap: PAGE_GAP,
        contentMarginTop: 0,
        contentMarginBottom: 0,
        pageBreakBackground: 'var(--canvas-bg)',
        pageGapBorderColor: 'transparent',
        pageGapBorderSize: 0,
        headerLeft: showHeader ? headerContent : '',
        headerRight: showHeader ? pageNumberToken(headerNumberFormat) : '',
        footerLeft: showFooter ? footerContent : '',
        footerRight: showFooter ? pageNumberToken(footerNumberFormat) : '',
      }),
    ],
    content,
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      lastEmittedRef.current = html
      propsRef.current.onContentChange(html)
    },
  })

  // Report the editor so the toolbar and AI features can act on it.
  useEffect(() => {
    onActiveEditorChange(editor)
  }, [editor, onActiveEditorChange])

  // Push externally-driven content (initial load, restore) into the editor
  // without firing a save cycle. Content emitted by this editor is tracked
  // in `lastEmittedRef` and never pushed back.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (content === lastEmittedRef.current) return
    if (content === editor.getHTML()) {
      lastEmittedRef.current = content
      return
    }
    lastEmittedRef.current = content
    editor.commands.setContent(content, { emitUpdate: false })
  }, [editor, content])

  // Apply layout changes (page size, margins, orientation, header/footer)
  // through the extension's update commands.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor
      .chain()
      .updatePageWidth(page.width)
      .updatePageHeight(page.height)
      .updateMargins({ top: topPx, bottom: bottomPx, left: leftPx, right: rightPx })
      .updateHeaderContent(
        showHeader ? headerContent : '',
        showHeader ? pageNumberToken(headerNumberFormat) : ''
      )
      .updateFooterContent(
        showFooter ? footerContent : '',
        showFooter ? pageNumberToken(footerNumberFormat) : ''
      )
      .run()
  }, [
    editor,
    page.width,
    page.height,
    topPx,
    bottomPx,
    leftPx,
    rightPx,
    showHeader,
    showFooter,
    headerContent,
    footerContent,
    headerNumberFormat,
    footerNumberFormat,
  ])

  // Grammar wavy underlines.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.commands.setGrammarIssues) {
      editor.commands.setGrammarIssues(grammarIssues)
    }
  }, [editor, grammarIssues])

  // Forward grammar-underline clicks to the parent.
  useEffect(() => {
    if (!editor) return
    const handler = (event: { issue: GrammarIssue; rect: DOMRect }): void => {
      propsRef.current.onGrammarClick(event.issue, event.rect)
    }
    editor.on('grammar-click', handler)
    return () => {
      editor.off('grammar-click', handler)
    }
  }, [editor])

  const romanStyle =
    headerNumberFormat === 'roman' || footerNumberFormat === 'roman'
      ? `.rm-with-pagination .rm-page-number::before,
         .rm-with-pagination .rm-page-number-plus::before {
           content: counter(page-number-plus, upper-roman);
         }`
      : ''

  if (!editor) return <div className="intellidocs-page-editor" />

  return (
    <div
      className="intellidocs-page-editor"
      style={{ width: `${page.width}px`, margin: '0 auto' }}
    >
      <style>
        {`.ProseMirror.rm-with-pagination {
            background: var(--page-bg);
            border-radius: 4px;
            box-shadow: var(--page-shadow);
          }
          .rm-with-pagination .rm-page-header,
          .rm-with-pagination .rm-page-footer {
            font-size: 0.6875rem;
            color: var(--muted-foreground);
          }
          ${romanStyle}`}
      </style>
      <TiptapCanvas editor={editor} />
    </div>
  )
}
