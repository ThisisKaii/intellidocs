import { useEffect, useRef, useState } from 'react'
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
import type { UnderlineStyle } from '@/lib/editorPreferences'
import { SlashCommandMenu } from './SlashCommandMenu'
import type { BehaviorEventPayload } from './behaviorListener'

/** Vertical gap between stacked page sheets, in px. */
const PAGE_GAP = 40

/** Horizontal gap between the two page sheets of a spread, in px. */
const SPREAD_GAP = 24

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

/** Number of pages to render instantly before progressive hydration begins. */
const INITIAL_PAGE_COUNT = 3

/** Maximum content length (chars) below which progressive loading is skipped. */
const PROGRESSIVE_THRESHOLD = 8000

/**
 * Split document HTML into page chunks at `<hr class="page-break">` boundaries.
 * Returns an array of HTML strings, one per page. If no page breaks are found,
 * returns the entire content as a single chunk.
 */
function splitIntoPageChunks(html: string): string[] {
  const PAGE_BREAK_RE = /<hr\s+class="page-break"[^>]*\/?>/gi
  if (!PAGE_BREAK_RE.test(html)) return [html]

  const parts: string[] = []
  let lastIdx = 0
  PAGE_BREAK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = PAGE_BREAK_RE.exec(html)) !== null) {
    parts.push(html.slice(lastIdx, match.index + match[0].length))
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < html.length) parts.push(html.slice(lastIdx))
  return parts.length > 0 ? parts : [html]
}

interface PagedEditorProps {
  /** Full document HTML — the single source of truth. */
  content: string
  /** Called with the full document HTML after any editor update. */
  onContentChange: (html: string) => void
  /** Called with the live editor once it exists. */
  onActiveEditorChange: (editor: Editor | null) => void
  /** Forwarded grammar-underline clicks for the popover (includes the PM position). */
  onGrammarClick: (issue: GrammarIssue, rect: DOMRect, pos: number) => void
  /** Grammar issues to underline in the editor. */
  grammarIssues: GrammarIssue[]
  /** Preferred underline style — changing it rebuilds the issue decorations. */
  underlineStyle: UnderlineStyle
  pageSize: PageSizeKey
  margins: MarginValues
  orientation: PageOrientation
  showHeader: boolean
  showFooter: boolean
  headerContent: string
  footerContent: string
  headerNumberFormat: PageNumberFormat
  footerNumberFormat: PageNumberFormat
  /**
   * Show two pages side by side as one continuous spread, as readers see an
   * open journal. Geometry and page breaks are untouched, so this is a view
   * mode only: page content, page numbers, and the exported DOCX are identical
   * to the stacked layout.
   */
  spreadPreview?: boolean
  /** Forwarded to the floating menu so structural actions reach the behavior pipeline. */
  onFormatApplied?: (action: string, payload?: BehaviorEventPayload) => void
}

/**
 * The whole document as a single TipTap editor paginated by the
 * tiptap-pagination-plus extension. Page breaks, headers, footers and margins
 * are computed by the extension from the configured page geometry; layout
 * prop changes are applied through its update commands.
 *
 * For long documents (>5 pages), content is progressively hydrated:
 * the first 3 pages render instantly, then remaining pages are appended
 * in idle frames to avoid freezing the browser.
 */
export function PagedEditor({
  content,
  onContentChange,
  onActiveEditorChange,
  onGrammarClick,
  grammarIssues,
  underlineStyle,
  pageSize,
  margins,
  orientation,
  showHeader,
  showFooter,
  headerContent,
  footerContent,
  headerNumberFormat,
  footerNumberFormat,
  spreadPreview = false,
  onFormatApplied,
}: PagedEditorProps): JSX.Element {
  const propsRef = useRef({ onContentChange, onGrammarClick })
  propsRef.current = { onContentChange, onGrammarClick }
  const lastEmittedRef = useRef<string | null>(null)
  const progressiveLoadedRef = useRef<boolean>(false)
  const cancelledRef = useRef<boolean>(false)
  const [loadProgress, setLoadProgress] = useState<number | null>(null)

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
    content: '',
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

  // Push externally-driven content (initial load, restore) into the editor.
  // For large documents, content is progressively hydrated in page chunks
  // to avoid freezing the browser main thread.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (content === lastEmittedRef.current) return
    if (content === editor.getHTML()) {
      lastEmittedRef.current = content
      return
    }

    lastEmittedRef.current = content

    // Small documents: load all at once (no progressive loading needed)
    if (content.length < PROGRESSIVE_THRESHOLD) {
      progressiveLoadedRef.current = false
      setLoadProgress(null)
      editor.commands.setContent(content, { emitUpdate: false })
      return
    }

    // Large documents: split into page chunks and progressively hydrate
    const chunks = splitIntoPageChunks(content)
    if (chunks.length <= INITIAL_PAGE_COUNT) {
      editor.commands.setContent(content, { emitUpdate: false })
      return
    }

    cancelledRef.current = false
    progressiveLoadedRef.current = false
    setLoadProgress(0)

    // Phase 1: Render initial pages immediately
    const initialHtml = chunks.slice(0, INITIAL_PAGE_COUNT).join('')
    editor.commands.setContent(initialHtml, { emitUpdate: false })

    // Phase 2: Append remaining chunks in idle frames
    let nextChunkIdx = INITIAL_PAGE_COUNT
    let rafId: number

    function appendNextChunk(): void {
      if (cancelledRef.current || nextChunkIdx >= chunks.length) {
        if (!cancelledRef.current) {
          progressiveLoadedRef.current = true
          setLoadProgress(null)
          // Emit final HTML so autosave captures the full document
          const finalHtml = editor.getHTML()
          lastEmittedRef.current = finalHtml
          propsRef.current.onContentChange(finalHtml)
        }
        return
      }

      const chunk = chunks[nextChunkIdx]
      if (chunk) {
        editor.commands.insertContent(chunk)
      }
      nextChunkIdx += 1
      setLoadProgress(Math.round((nextChunkIdx / chunks.length) * 100))

      // Yield to the browser for painting, then continue
      rafId = requestAnimationFrame(() => {
        // Use a short setTimeout to yield to the browser event loop
        // so the UI stays responsive during hydration
        setTimeout(appendNextChunk, 8)
      })
    }

    rafId = requestAnimationFrame(() => setTimeout(appendNextChunk, 8))

    return () => {
      cancelledRef.current = true
      cancelAnimationFrame(rafId)
    }
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

  // Grammar underlines — rebuild when the issue set OR the underline style changes.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.commands.setGrammarIssues) {
      editor.commands.setGrammarIssues(grammarIssues)
    }
  }, [editor, grammarIssues, underlineStyle])

  // Forward grammar-underline clicks to the parent.
  useEffect(() => {
    if (!editor) return
    const handler = (event: { issue: GrammarIssue; rect: DOMRect; pos: number }): void => {
      propsRef.current.onGrammarClick(event.issue, event.rect, event.pos)
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

  /*
   * Spread layout.
   *
   * tiptap-pagination-plus gives each page an inline `float: left` and
   * `clear: both`, plus a per-page `margin-top` computed to stack pages
   * vertically. Overriding those three properties and switching the page
   * container to a two-column grid is enough to pair pages 1|2, 3|4, ...
   * The extension still owns page height, breaks, and content flow.
   */
    const spreadStyle = `.rm-pages-wrapper {
       display: grid;
       grid-template-columns: repeat(var(--rm-page-columns, 1), var(--rm-page-width));
       gap: ${SPREAD_GAP}px;
       justify-content: center;
       align-items: start;
     }
     .rm-pages-wrapper > .rm-page-break {
       width: var(--rm-page-width);
       height: var(--rm-page-height);
       position: relative;
     }
     .rm-pages-wrapper > .rm-page-break > .page {
       float: none !important;
       clear: none !important;
       margin-top: 0 !important;
       width: var(--rm-page-width);
       height: 0 !important;
       min-height: 0 !important;
       max-height: 0 !important;
       overflow: visible;
       position: relative;
       pointer-events: none;
       background: transparent;
     }
     .rm-pages-wrapper > .rm-page-break > .page::before {
       content: '';
       display: block;
       position: absolute;
       top: 0;
       left: 0;
       width: 100%;
       height: var(--rm-page-height);
       background: var(--page-bg);
       box-shadow: var(--page-shadow);
       border-radius: 4px;
       z-index: 0;
       pointer-events: none;
     }
     .rm-pages-wrapper > .rm-page-break > .page > * {
       pointer-events: auto;
       position: relative;
       z-index: 1;
     }
     .intellidocs-page-editor--spread .rm-pages-wrapper {
       --rm-page-columns: 2;
     }
     .intellidocs-page-editor--spread .rm-pages-wrapper > .rm-page-break::after {
       counter-increment: spread-page;
       content: "Page " counter(spread-page);
       display: block;
       margin-top: 0.375rem;
       text-align: center;
       font-size: 0.6875rem;
       color: var(--muted-foreground);
       font-variant-numeric: tabular-nums;
     }`

  const pageLabel = spreadPreview ? 'Page' : null

  if (!editor) {
    return (
      <div
        className={`intellidocs-page-editor${
          spreadPreview ? ' intellidocs-page-editor--spread' : ''
        }`}
        style={
          spreadPreview
            ? { width: `${page.width * 2 + SPREAD_GAP}px`, margin: '0 auto' }
            : { width: `${page.width}px`, margin: '0 auto' }
        }
      />
    )
  }

  return (
    <div
      className={`intellidocs-page-editor${
        spreadPreview ? ' intellidocs-page-editor--spread' : ''
      }`}
      style={
        spreadPreview
          ? { width: `${page.width * 2 + SPREAD_GAP}px`, margin: '0 auto' }
          : { width: `${page.width}px`, margin: '0 auto' }
      }
    >
      <style>
        {`.ProseMirror.rm-with-pagination {
            background: var(--page-bg);
            border-radius: 4px;
            box-shadow: var(--page-shadow);
          }
          .rm-with-pagination .ProseMirror,
          .rm-with-pagination .ProseMirror .ProseMirror-selectednode {
            color: var(--text-primary);
            caret-color: var(--text-primary);
          }
          .rm-with-pagination .ProseMirror blockquote {
            border-left-color: var(--accent-strong);
            color: var(--text-secondary);
          }
          .rm-with-pagination p.is-editor-empty:first-child::before {
            color: var(--text-muted);
          }
          .rm-with-pagination .ProseMirror th {
            color: var(--text-primary);
          }
          .rm-with-pagination .ProseMirror pre,
          .rm-with-pagination .ProseMirror code {
            background: var(--surface-sunken);
          }
          .rm-with-pagination .rm-page-header,
          .rm-with-pagination .rm-page-footer {
            font-size: 0.6875rem;
            color: var(--text-secondary);
          }
          ${romanStyle}
          ${spreadStyle}
          ${pageLabel === null ? '' : `.intellidocs-page-editor--spread .rm-pages-wrapper { counter-reset: spread-page; }`}`}
      </style>
      <TiptapCanvas editor={editor} onFormatApplied={onFormatApplied} />
      <SlashCommandMenu editor={editor} />
      {loadProgress !== null && (
        <div
          style={{
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--secondary)',
            fontSize: '0.8125rem',
            color: 'var(--muted-foreground)',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '999px',
              backgroundColor: 'var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${loadProgress}%`,
                height: '100%',
                borderRadius: '999px',
                backgroundColor: 'var(--primary)',
                transition: 'width 120ms ease',
              }}
            />
          </div>
          <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {loadProgress}%
          </span>
        </div>
      )}
    </div>
  )
}
