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
