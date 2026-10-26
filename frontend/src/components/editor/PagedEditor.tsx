import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { PaginationPlus } from 'tiptap-pagination-plus'
import { ColumnsDraft } from './ColumnsDraft'
import {
  editorExtensions,
  TiptapCanvas,
  PAGE_SIZES,
  type PageSizeKey,
  type PageOrientation,
  type MarginValues,
  type PageNumberFormat,
  type HeaderFooterConfig,
  type HeaderFooterPlacement,
} from './TiptapEditor'
import type { UnderlineStyle } from '@/lib/editorPreferences'
import { SlashCommandMenu } from './SlashCommandMenu'
import type { BehaviorEventPayload } from './behaviorListener'
import type { GrammarIssue } from './GrammarPanel'
import { measureKey, numberingCss, pageZones, type PageLayoutData, type PageMeasure } from '@/lib/pageLayout'
import { sanitizeHeaderHtml } from '@/lib/sanitizeHeaderHtml'

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

/**
 * Lay out one header/footer zone's text and page number across the library's
 * two slots (left / right). 'split' keeps the classic Word look — text on the
 * left, page number on the right — while the other placements put both pieces
 * on one side; 'center' wraps its content in a full-width centered container.
 */
function composeZone(
  text: string,
  numberToken: string,
  placement: HeaderFooterPlacement
): { left: string; right: string } {
  const combined = [text, numberToken].filter((piece) => piece.length > 0).join('&nbsp;&nbsp;&nbsp;')
  switch (placement) {
    case 'left':
      return { left: combined, right: '' }
    case 'center':
      // The library renders this slot as a shrink-to-fit inline-block at the
      // left margin. A full-width wrapper lets the text center against the page.
      return {
        left: `<div style="width:100%; text-align:center; display:flex; justify-content:center; align-items:center;">${combined}</div>`,
        right: '',
      }
    case 'right':
      return { left: '', right: combined }
    case 'split':
    default:
      return { left: text, right: numberToken }
  }
}

/**
 * Strip redundant markup that imported documents carry (zero-width spaces,
 * attribute-less `<span>`/`<font>` wrappers, spans left empty after unwrap).
 * Runs before ProseMirror parses the HTML so the node tree stays lean.
 */
function sanitizeLoadedHtml(html: string): string {
  if (
    !html.includes('<span') &&
    !html.includes('<font') &&
    !html.includes('\u200B') &&
    !html.includes('<br')
  ) {
    return html
  }

  const doc = new DOMParser().parseFromString(`<div id="sanitize-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('sanitize-root')
  if (!root) return html

  // Collect first, then mutate: unwrapping during the walk disturbs it.
  const elements: Element[] = []
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.currentNode
  while (node) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('\u200B')) {
      node.textContent = node.textContent.replace(/\u200B/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      elements.push(node as Element)
    }
    node = walker.nextNode()
  }

  for (const el of elements) {
    if ((el.tagName === 'SPAN' && el.attributes.length === 0) || el.tagName === 'FONT') {
      el.replaceWith(...Array.from(el.childNodes))
    }
  }
  // Drop wrappers left empty by the unwrap pass.
  // (A tab node is an intentionally empty <span data-tab>; keep it.)
  for (const el of Array.from(root.querySelectorAll('span:empty:not([data-tab]), font:empty'))) {
    el.remove()
  }

  // Word renders each empty paragraph as ONE line, but a lone <br> survives
  // the editor's strict parsing as a hard-break node and renders TWO line
  // boxes — double-height blank lines in imported documents. Strip the break
  // so the paragraph loads empty (single line, matching Word).
  for (const paragraph of Array.from(root.querySelectorAll('p'))) {
    const children = Array.from(paragraph.childNodes).filter(
      (child) => !(child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()),
    )
    const only = children.length === 1 ? children[0] : null
    if (only && only.nodeType === Node.ELEMENT_NODE && (only as Element).tagName === 'BR') {
      only.remove()
    }
  }

  return root.innerHTML
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
  /** Header/footer configuration (replaces individual header/footer props). */
  headerFooterConfig: HeaderFooterConfig
  /** Imported header/footer art, per-section headers and page numbering; wins over the plain header text. */
  pageLayout?: PageLayoutData | null
  /**
   * Show two pages side by side as one continuous spread, as readers see an
   * open journal. Geometry and page breaks are untouched, so this is a view
   * mode only: page content, page numbers, and the exported DOCX are identical
   * to the stacked layout.
   */
  spreadPreview?: boolean
  /** Visual zoom for the whole canvas (1 = 100%). Layout is unaffected. */
  zoomLevel?: number
  /** Non-printing alignment gridlines over the text area of each page. */
  showGridlines?: boolean
  /** Notifies the page when progressive hydration starts or finishes. */
  onHydrationChange?: (loading: boolean) => void
  /** Fired when the user double-clicks a rendered page header or footer. */
  onHeaderFooterActivate?: (target: 'header' | 'footer') => void
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
  headerFooterConfig,
  pageLayout = null,
  spreadPreview = false,
  zoomLevel = 1,
  showGridlines = false,
  onHydrationChange,
  onHeaderFooterActivate,
  onFormatApplied,
}: PagedEditorProps): JSX.Element {
  const propsRef = useRef({ onContentChange, onGrammarClick })
  propsRef.current = { onContentChange, onGrammarClick }
  const lastEmittedRef = useRef<string | null>(null)
  // Pagination is paused around a document load so the single ProseMirror
  // parse triggers exactly one page relayout instead of intermediate passes.
  const paginationPausedRef = useRef<boolean>(false)
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

  // Header/footer slot strings for the pagination library (left / right per zone).
  const headerSlots = composeZone(
    headerFooterConfig.header.default.content,
    pageNumberToken(headerFooterConfig.header.default.numberFormat),
    headerFooterConfig.header.placement
  )
  const footerSlots = composeZone(
    headerFooterConfig.footer.default.content,
    pageNumberToken(headerFooterConfig.footer.default.numberFormat),
    headerFooterConfig.footer.placement
  )

  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      ColumnsDraft,
      PaginationPlus.configure({
        enabled: true,
        pageWidth: page.width,
        pageHeight: page.height,
        marginTop: topPx,
        marginBottom: bottomPx,
        marginLeft: leftPx,
        marginRight: rightPx,
        pageGap: PAGE_GAP,
        // PaginationPlus starts content at marginTop + contentMarginTop +
        // headerHeight, so a non-zero value here doubles the top margin.
        contentMarginTop: 0,
        contentMarginBottom: 0,
        pageBreakBackground: 'var(--canvas-bg)',
        pageGapBorderColor: 'transparent',
        pageGapBorderSize: 0,
        headerLeft: headerSlots.left,
        headerRight: headerSlots.right,
        footerLeft: footerSlots.left,
        footerRight: footerSlots.right,
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

  // Report progressive-hydration state so heavy document scanners can pause
  // while chunks are still streaming in.
  useEffect(() => {
    onHydrationChange?.(loadProgress !== null)
  }, [loadProgress, onHydrationChange])

  // Word-style direct manipulation: double-clicking a rendered page header or
  // footer asks the host page to open Page Setup focused on that field.
  // Delegated on the editor root because the pagination library renders the
  // header/footer elements itself (pages are added dynamically).
  useEffect(() => {
    if (!editor || !onHeaderFooterActivate) return
    const dom = editor.view.dom
    const onDblClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('.rm-page-header')) onHeaderFooterActivate('header')
      else if (target.closest('.rm-page-footer')) onHeaderFooterActivate('footer')
    }
    dom.addEventListener('dblclick', onDblClick)
    return () => dom.removeEventListener('dblclick', onDblClick)
  }, [editor, onHeaderFooterActivate])

  // Push externally-driven content (initial load, restore) into the editor.
  // One transactional parse of the whole document: the editor previously
  // streamed large imports in page chunks, but ProseMirror strips a trailing
  // <hr> from every parsed fragment, so chunk boundaries silently deleted
  // page breaks (and adjacent content) from the saved document on each
  // load/save cycle. A single parse has no fragment boundaries to lose nodes
  // at; pagination is paused around it so exactly one page relayout runs.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (content === lastEmittedRef.current) return
    if (content === editor.getHTML()) {
      lastEmittedRef.current = content
      return
    }

    lastEmittedRef.current = content

    // Strip import-only wrapper markup before ProseMirror builds its nodes.
    const cleanContent = sanitizeLoadedHtml(content)

    if (!paginationPausedRef.current) {
      paginationPausedRef.current = true
      editor.commands.disablePagination()
    }
    editor.commands.setContent(cleanContent, { emitUpdate: false })
    if (paginationPausedRef.current) {
      paginationPausedRef.current = false
      editor.commands.enablePagination()
    }
    setLoadProgress(null)
  }, [editor, content])

  // Layout values last dispatched to the pagination extension. The guard below
  // keeps identical values (including object-identity changes with equal
  // values) from re-running the chain and restarting the update cycle.
  const lastAppliedLayoutRef = useRef<{
    editor: Editor
    width: number
    height: number
    top: number
    bottom: number
    left: number
    right: number
    contentMarginTop: number
    contentMarginBottom: number
    headerLeft: string
    headerRight: string
    footerLeft: string
    footerRight: string
    differentFirstPage: boolean
  } | null>(null)

  // Apply layout changes (page size, margins, orientation, header/footer)
  // through the extension's update commands.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const currentLayout = {
      editor,
      width: page.width,
      height: page.height,
      top: topPx,
      bottom: bottomPx,
      left: leftPx,
      right: rightPx,
      contentMarginTop: 0,
      contentMarginBottom: 0,
      headerLeft: headerSlots.left,
      headerRight: headerSlots.right,
      footerLeft: footerSlots.left,
      footerRight: footerSlots.right,
      differentFirstPage: headerFooterConfig.differentFirstPage,
    }

    const previousLayout = lastAppliedLayoutRef.current
    if (
      previousLayout &&
      previousLayout.editor === currentLayout.editor &&
      previousLayout.width === currentLayout.width &&
      previousLayout.height === currentLayout.height &&
      previousLayout.top === currentLayout.top &&
      previousLayout.bottom === currentLayout.bottom &&
      previousLayout.left === currentLayout.left &&
      previousLayout.right === currentLayout.right &&
      previousLayout.contentMarginTop === currentLayout.contentMarginTop &&
      previousLayout.contentMarginBottom === currentLayout.contentMarginBottom &&
      previousLayout.headerLeft === currentLayout.headerLeft &&
      previousLayout.headerRight === currentLayout.headerRight &&
      previousLayout.footerLeft === currentLayout.footerLeft &&
      previousLayout.footerRight === currentLayout.footerRight &&
      previousLayout.differentFirstPage === currentLayout.differentFirstPage
    ) {
      return
    }

    lastAppliedLayoutRef.current = currentLayout

    // First-page zone content: blank when the document omits headers/footers
    // on the title page, otherwise mirror the common content.
    const firstHeaderLeft = headerFooterConfig.differentFirstPage ? '' : headerSlots.left
    const firstHeaderRight = headerFooterConfig.differentFirstPage ? '' : headerSlots.right
    const firstFooterLeft = headerFooterConfig.differentFirstPage ? '' : footerSlots.left
    const firstFooterRight = headerFooterConfig.differentFirstPage ? '' : footerSlots.right

    editor
      .chain()
      .updatePageWidth(page.width)
      .updatePageHeight(page.height)
      .updateMargins({
        top: topPx,
        bottom: bottomPx,
        left: leftPx,
        right: rightPx,
      })
      .updateContentMargins({
        top: 0,
        bottom: 0,
      })
      .updateHeaderContent(headerSlots.left, headerSlots.right)
      .updateFooterContent(footerSlots.left, footerSlots.right)
      .updateHeaderContent(firstHeaderLeft, firstHeaderRight, 1)
      .updateFooterContent(firstFooterLeft, firstFooterRight, 1)
      .run()
  }, [
    editor,
    page.width,
    page.height,
    topPx,
    bottomPx,
    leftPx,
    rightPx,
    headerSlots.left,
    headerSlots.right,
    footerSlots.left,
    footerSlots.right,
    headerFooterConfig,
  ])

  // Where each Word section starts and how many pages there are, read from the laid-out
  // editor. Section breaks carry `data-section`; a page break at the top of a page
  // starts that page, otherwise the section starts on the page after the break.
  const [measure, setMeasure] = useState<PageMeasure>({ starts: [], pageCount: 1 })
  useEffect(() => {
    if (!editor || editor.isDestroyed || !pageLayout) return
    const dom = editor.view.dom as HTMLElement
    const pitch = page.height + PAGE_GAP
    let frame = 0
    const read = (): void => {
      frame = 0
      const rect = dom.getBoundingClientRect()
      const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
      const next: PageMeasure = {
        pageCount: Math.max(1, Math.round((rect.height / scale + PAGE_GAP) / pitch)),
        starts: [],
      }
      dom.querySelectorAll<HTMLElement>('.intellidocs-page-break[data-section]').forEach((el) => {
        const bottom = (el.getBoundingClientRect().bottom - rect.top) / scale
        const atTop = el.offsetHeight <= 1
        const startPage = Math.floor(bottom / pitch) + (atTop ? 1 : 2)
        next.starts.push({ section: Number(el.dataset.section), page: startPage })
      })
      setMeasure((previous) => (measureKey(previous) === measureKey(next) ? previous : next))
    }
    const schedule = (): void => {
      if (!frame) frame = window.requestAnimationFrame(read)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(dom)
    const mutations = new MutationObserver(schedule)
    mutations.observe(dom, { childList: true, subtree: true })
    schedule()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [editor, pageLayout, page.height])

  // Boxes Word hangs beside a paragraph are placed from that paragraph's top, so they follow the text
  // wherever it flows. Positions are re-measured whenever the layout settles.
  const overlayLayerRef = useRef<HTMLDivElement | null>(null)
  const [overlayPositions, setOverlayPositions] = useState<Array<{ id: string; left: number; top: number }>>([])
  const overlays = pageLayout?.overlays
  useEffect(() => {
    if (!editor || editor.isDestroyed || !overlays || Object.keys(overlays).length === 0) {
      setOverlayPositions((previous) => (previous.length === 0 ? previous : []))
      return
    }
    const dom = editor.view.dom as HTMLElement
    let frame = 0
    const read = (): void => {
      frame = 0
      const layer = overlayLayerRef.current
      if (!layer) return
      const origin = layer.getBoundingClientRect()
      const rect = dom.getBoundingClientRect()
      const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
      const next: Array<{ id: string; left: number; top: number }> = []
      dom.querySelectorAll<HTMLElement>('[data-overlay]').forEach((el) => {
        const top = (el.getBoundingClientRect().top - origin.top) / scale
        for (const id of (el.dataset.overlay ?? '').split(' ')) {
          if (overlays[id]) next.push({ id, left: (rect.left - origin.left) / scale, top })
        }
      })
      const key = (list: typeof next): string => list.map((item) => `${item.id}:${Math.round(item.left)}:${Math.round(item.top)}`).join('|')
      setOverlayPositions((previous) => (key(previous) === key(next) ? previous : next))
    }
    const schedule = (): void => {
      if (!frame) frame = window.requestAnimationFrame(read)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(dom)
    const mutations = new MutationObserver(schedule)
    mutations.observe(dom, { childList: true, subtree: true, characterData: true })
    schedule()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [editor, overlays])

  // Word's widow/orphan rules are opt-in (`flow_rules: true`): measured on the fixtures they moved
  // lines Word had left alone, because our page bodies already differ from Word's by a line or two.
  const flowRules = pageLayout?.flow_rules === true
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    ;(editor.storage as unknown as { pageFlow: { enabled: boolean } }).pageFlow.enabled = flowRules
  }, [editor, flowRules])

  // Give every page the header and footer of its section: art, text and page numbers.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !pageLayout) return
    const chain = editor.chain()
    for (let pageNumber = 1; pageNumber <= measure.pageCount; pageNumber += 1) {
      const zones = pageZones(pageLayout, measure, pageNumber)
      chain
        .updateHeaderContent(sanitizeHeaderHtml(zones.header), '', pageNumber)
        .updateFooterContent(sanitizeHeaderHtml(zones.footer), '', pageNumber)
    }
    chain.updateHeaderContent('', '').updateFooterContent('', '').run()
  }, [editor, pageLayout, measure, page.width, page.height, topPx, bottomPx, leftPx, rightPx, headerFooterConfig])

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
    headerFooterConfig.header.default.numberFormat === 'roman' || headerFooterConfig.footer.default.numberFormat === 'roman'
      ? `.rm-with-pagination .rm-page-number::before,
         .rm-with-pagination .rm-page-number-plus::before {
           content: counter(page-number-plus, upper-roman);
         }`
      : ''

  /*
   * Spread / grid layout transform.
   *
   * tiptap-pagination-plus gives each page an inline `float: left` and
   * `clear: both`, plus a per-page `margin-top` computed to stack pages
   * vertically. Overriding those three properties and switching the page
   * container to a grid is enough to pair pages 1|2, 3|4, … (spread) or to
   * wrap them in a multi-page grid. The extension still owns page height,
   * breaks, and content flow, so `view.update` measurements stay identical to
   * the vertical layout (the earlier freeze came from corrupting them).
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

  // Non-printing gridlines (Word: View → Gridlines) drawn as a React-managed
  // overlay: one absolutely positioned layer per page. Page geometry is pure
  // math — a page sheet starts every `page.height + gap` and the text area
  // sits inside the margins — so nothing anchors to the library's zero-height
  // float markers (which painted the old CSS pseudo-element off-sheet).
  const [gridPageCount, setGridPageCount] = useState<number>(0)

  useEffect(() => {
    if (!editor || editor.isDestroyed || !showGridlines) {
      setGridPageCount(0)
      return
    }
    const sync = (): void => {
      const count = editor.view.dom.querySelectorAll('.rm-page-break').length
      setGridPageCount((prev) => (prev === count ? prev : count))
    }
    sync()
    editor.on('update', sync)
    window.addEventListener('resize', sync)
    return () => {
      editor.off('update', sync)
      window.removeEventListener('resize', sync)
    }
  }, [editor, showGridlines])

  const containerClassName = `intellidocs-page-editor${
    spreadPreview ? ' intellidocs-page-editor--spread' : ''
  }${
    showGridlines ? ' intellidocs-page-editor--gridlines' : ''
  }${
    headerFooterConfig.header.placement === 'center' ? ' intellidocs-page-editor--header-center' : ''
  }${
    headerFooterConfig.footer.placement === 'center' ? ' intellidocs-page-editor--footer-center' : ''
  }`
  const containerStyle: CSSProperties = spreadPreview
    ? { position: 'relative', width: `${page.width * 2 + SPREAD_GAP}px`, margin: '0 auto', zoom: zoomLevel }
    : { position: 'relative', width: `${page.width}px`, margin: '0 auto', zoom: zoomLevel }

  if (!editor) {
    return <div className={containerClassName} style={containerStyle} />
  }

  return (
    <div className={containerClassName} style={containerStyle}>
      <style>
        {`.ProseMirror.rm-with-pagination {
            /* The library draws a 1px border on the page stack (border-box), which
               left every text column 2px narrower than the page's margins say and
               re-wrapped lines Word fits. */
            border: 0 !important;
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
          /* The library sizes each page's body as page - (margin + header
             content height) - (margin + footer content height), so the
             header/footer rows were carved out of the printable area: the
             first grid row was the header's clickable zone and the last row
             could not hold text. Measure the content rows as 0px tall (the
             zone padding, which IS the margin, is untouched) and draw the text
             inside the margin instead, centred between the page edge and the
             margin line. overflow must beat the library's inline overflow. */
          .rm-with-pagination .rm-page-header-content {
            height: 0 !important;
            overflow: visible !important;
            position: relative;
            top: calc(var(--rm-margin-top) * -0.5);
          }
          .rm-with-pagination .rm-page-footer-content {
            height: 0 !important;
            overflow: visible !important;
            position: relative;
            top: calc(var(--rm-margin-bottom) * 0.5 - 9px);
          }
          /* The library lays each zone out as display:inline-flex, which sits
             in an anonymous line box: the first paragraph then starts a font-
             dependent 8-11px BELOW the zone's bottom edge (the margin line),
             pushing every page's text ~0.1in down so imported documents ran
             long (e.g. the last title-page line spilled to page 2). A block
             flex zone ends exactly on the margin line. */
          .rm-with-pagination .rm-page-header,
          .rm-with-pagination .rm-page-footer {
            display: flex;
          }
          /* Word lays text out with device-independent widths; Chrome's come out a hair wider, so
             a line Word fills to the margin wraps a word early here. A sub-pixel tightening
             makes the same words fit the same lines. */
          .ProseMirror.rm-with-pagination p,
          .ProseMirror.rm-with-pagination li,
          .ProseMirror.rm-with-pagination td {
            letter-spacing: -0.1px;
          }
          /* Imported header/footer art is positioned from the page corner and
             reaches outside the zone, so neither zone may clip it. */
          .rm-with-pagination .rm-page-header,
          .rm-with-pagination .rm-page-footer {
            overflow: visible !important;
            max-height: none !important;
          }
          /* The pagination library sets word-break: break-all on every table
             cell; with its shrink-to-fit tbody that collapsed imported tables
             to ~36px columns, broke words mid-word and inflated documents by
             ~20 pages. Break only at word boundaries (or when a single word
             cannot fit). */
          .rm-with-pagination table tr td,
          .rm-with-pagination table tr th {
            word-break: normal;
            overflow-wrap: break-word;
          }
          /* Centered header/footer placement: fill the space between the page
             margins so the text centers on the text column, not the page. */
          .intellidocs-page-editor--header-center .rm-with-pagination .rm-page-header-left,
          .intellidocs-page-editor--footer-center .rm-with-pagination .rm-page-footer-left {
            float: none !important;
            flex: 1 1 auto;
            width: auto;
            margin-left: var(--rm-margin-left) !important;
            margin-right: var(--rm-margin-right) !important;
            text-align: center;
          }
          /* Two-column draft (IEEE): pagination is off, so the body flows in two
             columns on one long page-width sheet; front matter spans both. */
          .ProseMirror.ieee-columns-draft {
            columns: 2;
            column-gap: 0.25in;
            padding: ${topPx}px ${rightPx}px ${bottomPx}px ${leftPx}px !important;
            width: ${page.width}px;
            box-sizing: border-box;
            text-align: justify;
          }
          .ProseMirror.ieee-columns-draft .ieee-front {
            column-span: all;
          }
          ${pageLayout ? numberingCss(pageLayout, measure) : romanStyle}
          ${spreadPreview ? spreadStyle : ''}
          ${pageLabel === null ? '' : '.intellidocs-page-editor--spread .rm-pages-wrapper { counter-reset: spread-page; }'}`}
      </style>
      <TiptapCanvas editor={editor} onFormatApplied={onFormatApplied} />
      {overlays && Object.keys(overlays).length > 0 && (
        <div ref={overlayLayerRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
          {overlayPositions.map(({ id, left, top }) => {
            const box = overlays[id]
            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  left: left + box.x,
                  top: top + box.y,
                  width: box.w,
                  height: box.h,
                  mixBlendMode: box.behind ? 'multiply' : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHeaderHtml(box.html) }}
              />
            )
          })}
        </div>
      )}
      {showGridlines && gridPageCount > 0 && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        >
          {Array.from({ length: gridPageCount }).map((_, index) => {
            const column = spreadPreview ? index % 2 : 0
            const row = spreadPreview ? Math.floor(index / 2) : index
            const sheetTop = row * (page.height + (spreadPreview ? SPREAD_GAP : PAGE_GAP))
            const sheetLeft = column * (page.width + SPREAD_GAP)
            return (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  top: `${sheetTop + topPx}px`,
                  left: `${sheetLeft + leftPx}px`,
                  width: `${page.width - leftPx - rightPx}px`,
                  height: `${page.height - topPx - bottomPx}px`,
                  backgroundImage:
                    'linear-gradient(to right, rgba(15, 23, 42, 0.07) 1px, transparent 1px), ' +
                    'linear-gradient(to bottom, rgba(15, 23, 42, 0.07) 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                  border: '1px dashed rgba(15, 23, 42, 0.12)',
                  borderRadius: '2px',
                }}
              />
            )
          })}
        </div>
      )}
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
