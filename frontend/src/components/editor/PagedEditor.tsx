import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { PaginationPlus } from 'tiptap-pagination-plus'
import { ColumnsDraft } from './ColumnsDraft'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import type * as Y from 'yjs'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { WebsocketProvider } from 'y-websocket'
import {
  buildEditorExtensions,
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
import { MathEditPopover } from './MathEditPopover'
import type { BehaviorEventPayload } from './behaviorListener'
import type { GrammarIssue } from './GrammarPanel'
import { loadEditorContent } from '@/lib/loadEditorContent'
import type { EditorJson } from '@/services/api'
import {
  FIRST_CHAPTER,
  lastLineSlackPx,
  manuscriptNumberingCss,
  measureKey,
  mergeLayoutSections,
  numberingCss,
  pageZones,
  type DocumentSectionBreak,
  type PageLayoutData,
  type PageMeasure,
} from '@/lib/pageLayout'
import { documentSectionBreaks } from './SectionLayout'
import { layoutForTab, tabNumberingCss, type ResolvedTabNumbering } from '@/lib/tabNumbering'
import { sanitizeHeaderHtml } from '@/lib/sanitizeHeaderHtml'

/**
 * Position of the block that opens Chapter 1, or null. Contents entries also read "CHAPTER I …",
 * so a heading wins; otherwise the last short line (the contents come before the chapter).
 * Entries ending in a page number or holding a tab are contents lines, never the chapter.
 */
export function firstChapterPos(doc: ProseMirrorNode): number | null {
  let heading: number | null = null
  let line: number | null = null
  doc.forEach((node, offset) => {
    if (heading !== null || !node.isTextblock) return
    const text = node.textContent.trim()
    const match = FIRST_CHAPTER.exec(text)
    if (!match || text.length > 80) return
    let tab = false
    node.forEach((child) => {
      if (!child.isText && /tab/i.test(child.type.name)) tab = true
    })
    if (tab || /\d\s*$/.test(text.slice(match[0].length))) return
    if (node.type.name === 'heading') heading = offset
    else line = offset
  })
  return heading ?? line
}

/** Limit page-numbering rules to one editor's container (see the `scopeId` prop). */
function scopeCss(css: string, scopeId: string | undefined): string {
  if (!scopeId) return css
  return css.replace(/(^|[,}\n]\s*)\.rm-with-pagination/g, `$1[data-editor-scope="${scopeId}"] .rm-with-pagination`)
}

/** Vertical gap between stacked page sheets, in px. */
const PAGE_GAP = 40
/** Longest the host waits for the editor's content while the user types (see onUpdate). */
const EMIT_INTERVAL_MS = 400
/**
 * A document this long (ProseMirror positions, about 120 pages) is handed over when typing pauses
 * instead of every EMIT_INTERVAL_MS: serialising a manuscript of several hundred pages takes long
 * enough that doing it a few times a second while typing made the editor stutter.
 */
const LARGE_DOCUMENT_SIZE = 250_000
const LARGE_DOCUMENT_PAUSE_MS = 1200
/** A long document is still handed over at least this often while the user keeps typing (autosave). */
const LARGE_DOCUMENT_MAX_WAIT_MS = 15_000

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
  // (A tab node is an intentionally empty <span data-tab>, and an inline equation is an empty
  // <span data-type="inline-math"> drawn from its data-latex; keep both.)
  for (const el of Array.from(root.querySelectorAll('span:empty:not([data-tab]):not([data-type="inline-math"]), font:empty'))) {
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
  /** Full document HTML. A change here (load, restore, remote edit) is pushed into the editor. */
  content: string
  /**
   * The editor's saved JSON of the same document. When set it is what loads with a `content`
   * change, since parsing HTML back can drift; invalid JSON falls back to `content`.
   */
  contentJson?: EditorJson | null
  /** Called with the full document HTML and the editor's JSON after any editor update. */
  onContentChange: (html: string, json: EditorJson) => void
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
  /**
   * Live collaboration: the editor edits this shared Yjs document and shows other people's carets.
   * Fixed for the editor's lifetime (the host remounts the editor to change it).
   */
  collaboration?: EditorCollaboration | null
  /**
   * For one tab of a document split into tabs: the number its first page shows and its format, from
   * the tabs before it (lib/tabNumbering). Replaces the document-wide numbering for this tab.
   */
  tabNumbering?: ResolvedTabNumbering | null
  /**
   * Several editors on one page (the whole-document view shows tabs one under another): each
   * numbers its own pages, so its numbering CSS is limited to its own container.
   */
  scopeId?: string
}

/** The shared document and how this person's caret appears to others. */
export interface EditorCollaboration {
  ydoc: Y.Doc
  provider: WebsocketProvider
  user: { name: string; color: string }
}

/** "Joshua Asingua" → "JA"; a single word gives one letter. */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  return letters || '?'
}

/** A remote person's caret: a colored bar with their initials in a pill (full name on hover). */
function renderCollabCaret(user: Record<string, unknown>): HTMLElement {
  const name = typeof user.name === 'string' ? user.name : 'Someone'
  const color = typeof user.color === 'string' ? user.color : '#6366f1'
  const caret = document.createElement('span')
  caret.classList.add('collab-caret')
  caret.style.borderColor = color
  const label = document.createElement('span')
  label.classList.add('collab-caret__label')
  label.style.backgroundColor = color
  label.textContent = initialsOf(name)
  label.title = name
  caret.append(document.createTextNode('⁠'), label, document.createTextNode('⁠'))
  return caret
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
  contentJson = null,
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
  collaboration = null,
  tabNumbering = null,
  scopeId,
}: PagedEditorProps): JSX.Element {
  const propsRef = useRef({ onContentChange, onGrammarClick })
  propsRef.current = { onContentChange, onGrammarClick }
  const lastEmittedRef = useRef<string | null>(null)
  // Read when `content` changes, not a trigger of its own: the host sets both together. Each JSON
  // object loads once, so a host that later sets HTML alone never gets the older JSON back.
  const contentJsonRef = useRef<EditorJson | null>(contentJson)
  contentJsonRef.current = contentJson
  const loadedJsonRef = useRef<EditorJson | null>(null)
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
  const bottomPx = inToPx(margins.bottom) - lastLineSlackPx(pageLayout)
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

  // A scheduled delivery of the editor's content to the host (see onUpdate).
  const emitTimerRef = useRef<number | null>(null)
  // When the oldest change not yet handed over was made (long documents wait for a pause).
  const firstPendingRef = useRef<number | null>(null)
  const emitContent = (ed: Editor): void => {
    if (ed.isDestroyed) return
    const html = ed.getHTML()
    lastEmittedRef.current = html
    propsRef.current.onContentChange(html, ed.getJSON())
  }
  // Read once: the extensions are fixed when the editor is created.
  const collabRef = useRef(collaboration)
  // In a shared session the document comes from the Yjs room, so the first `content` (the last
  // save) must not be pushed in: it would replace everyone's newer edits. Later pushes (import,
  // version restore, recovered draft) are deliberate and do go to everyone.
  const skipFirstLoadRef = useRef(Boolean(collaboration))

  const editor = useEditor({
    extensions: [
      ...buildEditorExtensions(Boolean(collabRef.current)),
      ...(collabRef.current
        ? [
            Collaboration.configure({ document: collabRef.current.ydoc }),
            CollaborationCaret.configure({
              provider: collabRef.current.provider,
              user: collabRef.current.user,
              render: renderCollabCaret,
            }),
          ]
        : []),
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
    // Serialising the whole document (HTML and JSON) on every keystroke cost a long document most
    // of each keystroke's time. While typing, the host gets the content at most every
    // EMIT_INTERVAL_MS; the last change is always delivered (and flushed on unmount).
    onUpdate: ({ editor: ed }) => {
      const deliver = (): void => {
        emitTimerRef.current = null
        firstPendingRef.current = null
        emitContent(ed)
      }
      if (ed.state.doc.content.size >= LARGE_DOCUMENT_SIZE) {
        // Long document: wait for a pause in typing (but never longer than the max wait).
        const now = Date.now()
        if (firstPendingRef.current === null) firstPendingRef.current = now
        if (emitTimerRef.current !== null) window.clearTimeout(emitTimerRef.current)
        const waited = now - firstPendingRef.current
        emitTimerRef.current = window.setTimeout(deliver, Math.max(0, Math.min(LARGE_DOCUMENT_PAUSE_MS, LARGE_DOCUMENT_MAX_WAIT_MS - waited)))
        return
      }
      if (emitTimerRef.current !== null) return
      emitTimerRef.current = window.setTimeout(deliver, EMIT_INTERVAL_MS)
    },
  })

  // Deliver a pending change before the editor goes away.
  useEffect(
    () => () => {
      if (emitTimerRef.current !== null && editor && !editor.isDestroyed) {
        window.clearTimeout(emitTimerRef.current)
        emitTimerRef.current = null
        firstPendingRef.current = null
        emitContent(editor)
      }
    },
    [editor]
  )

  // Report the editor so the toolbar and AI features can act on it.
  useEffect(() => {
    onActiveEditorChange(editor)
    // This editor is destroyed when the component goes (another tab, a reload, collaboration
    // starting): the page must not keep rendering toolbars against it.
    return () => onActiveEditorChange(null)
  }, [editor, onActiveEditorChange])

  // Sections whose margins differ from the page setup are moved by the difference (SectionLayout).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.commands.setSectionPageMargins({ top: topPx, right: rightPx, bottom: inToPx(margins.bottom), left: leftPx })
  }, [editor, topPx, rightPx, leftPx, margins.bottom])

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
    if (skipFirstLoadRef.current) {
      skipFirstLoadRef.current = false
      lastEmittedRef.current = content
      return
    }
    if (content === lastEmittedRef.current) return
    if (content === editor.getHTML()) {
      lastEmittedRef.current = content
      return
    }

    lastEmittedRef.current = content
    // New content from the host (import, restore) replaces the document: a pending delivery of
    // the old content must not follow it and overwrite the host's copy.
    if (emitTimerRef.current !== null) {
      window.clearTimeout(emitTimerRef.current)
      emitTimerRef.current = null
      firstPendingRef.current = null
    }

    // Strip import-only wrapper markup before ProseMirror builds its nodes. The saved JSON, when
    // there is one, is the editor's own and loads in preference (the HTML is its fallback).
    const cleanContent = sanitizeLoadedHtml(content)

    if (!paginationPausedRef.current) {
      paginationPausedRef.current = true
      editor.commands.disablePagination()
    }
    const json = contentJsonRef.current === loadedJsonRef.current ? null : contentJsonRef.current
    loadedJsonRef.current = json ?? loadedJsonRef.current
    loadEditorContent(editor, cleanContent, json)
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

  // The document's own section breaks decide each section's header, footer and numbering; the list
  // stored with the import (page_layout.sections) covers documents whose breaks carry no properties.
  const [sectionBreaks, setSectionBreaks] = useState<DocumentSectionBreak[]>([])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const read = (): void => {
      const next = documentSectionBreaks(editor.state.doc)
      setSectionBreaks((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) read()
    }
    read()
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])
  const layout = useMemo<PageLayoutData | null>(
    () => (pageLayout ? { ...pageLayout, sections: mergeLayoutSections(pageLayout.sections, sectionBreaks) } : null),
    [pageLayout, sectionBreaks],
  )

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

  // Word's widow/orphan rules run when the imported file asks for them (`flow_rules: true`, set by the
  // converter from the document's own w:widowControl). Documents written in the editor do not use them.
  const flowRules = pageLayout?.flow_rules === true
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    ;(editor.storage as unknown as { pageFlow: { enabled: boolean } }).pageFlow.enabled = flowRules
  }, [editor, flowRules])

  // Give every page the header and footer of its section: art, text and page numbers.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !layout) return
    const chain = editor.chain()
    for (let pageNumber = 1; pageNumber <= measure.pageCount; pageNumber += 1) {
      const zones = pageZones(layout, measure, pageNumber)
      chain
        .updateHeaderContent(sanitizeHeaderHtml(zones.header), '', pageNumber)
        .updateFooterContent(sanitizeHeaderHtml(zones.footer), '', pageNumber)
    }
    chain.updateHeaderContent('', '').updateFooterContent('', '').run()
  }, [editor, layout, measure, page.width, page.height, topPx, bottomPx, leftPx, rightPx, headerFooterConfig])

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

  // Manuscript numbering (no number on the title page, Roman front matter, Arabic from Chapter 1)
  // needs the page Chapter 1 starts on and the page count, read from the laid-out editor.
  // A tab of a split document takes its numbering from the tabs before it instead.
  const showsNumbers =
    headerFooterConfig.header.default.numberFormat !== 'none' || headerFooterConfig.footer.default.numberFormat !== 'none'
  const tabNumbered = Boolean(tabNumbering) && showsNumbers
  const manuscript =
    !layout &&
    !tabNumbered &&
    (headerFooterConfig.header.default.numberFormat === 'manuscript' || headerFooterConfig.footer.default.numberFormat === 'manuscript')
  const [manuscriptPages, setManuscriptPages] = useState<{ chapterPage: number | null; pageCount: number }>({ chapterPage: null, pageCount: 1 })
  useEffect(() => {
    if (!editor || editor.isDestroyed || !(manuscript || (tabNumbered && !layout))) return
    const dom = editor.view.dom as HTMLElement
    const pitch = page.height + PAGE_GAP
    let frame = 0
    const read = (): void => {
      frame = 0
      if (editor.isDestroyed) return
      const rect = dom.getBoundingClientRect()
      const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
      const pageCount = Math.max(1, Math.round((rect.height / scale + PAGE_GAP) / pitch))
      const pos = manuscript ? firstChapterPos(editor.state.doc) : null
      let chapterPage: number | null = null
      const node = pos === null ? null : editor.view.nodeDOM(pos)
      if (node instanceof HTMLElement) {
        chapterPage = Math.floor((node.getBoundingClientRect().top - rect.top) / scale / pitch) + 1
      }
      setManuscriptPages((previous) =>
        previous.chapterPage === chapterPage && previous.pageCount === pageCount ? previous : { chapterPage, pageCount },
      )
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
  }, [editor, manuscript, tabNumbered, layout, page.height])

  const romanStyle = tabNumbered && tabNumbering && !layout
    ? tabNumberingCss(tabNumbering, manuscriptPages.pageCount)
    : manuscript
    ? manuscriptNumberingCss(manuscriptPages.chapterPage, manuscriptPages.pageCount)
    : headerFooterConfig.header.default.numberFormat === 'roman' || headerFooterConfig.footer.default.numberFormat === 'roman'
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
  // Where each page sheet starts, read from the editor and the gaps between pages. The first sheet is
  // not always exactly page.height tall (on the Document page it came out 32px taller), so a box at
  // index * (page.height + PAGE_GAP) sat above every later page's text area.
  const [gridPageTops, setGridPageTops] = useState<number[]>([])
  const gridLayerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editor || editor.isDestroyed || !showGridlines) {
      setGridPageCount(0)
      setGridPageTops([])
      return
    }
    const sync = (): void => {
      const dom = editor.view.dom as HTMLElement
      const count = dom.querySelectorAll('.rm-page-break').length
      setGridPageCount((prev) => (prev === count ? prev : count))
      const layer = gridLayerRef.current
      if (!layer) return
      const origin = layer.getBoundingClientRect()
      const rect = dom.getBoundingClientRect()
      const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
      const gaps = Array.from(dom.querySelectorAll<HTMLElement>('.rm-pagination-gap'))
        .map((gap) => gap.getBoundingClientRect())
        .filter((box) => box.height > 0)
        .map((box) => ({ top: (box.top - origin.top) / scale, bottom: (box.bottom - origin.top) / scale }))
        .sort((a, b) => a.top - b.top)
      // The first sheet starts with the editor; each later one right after the gap above it.
      const tops = [(rect.top - origin.top) / scale, ...gaps.map((gap) => gap.bottom)]
      setGridPageTops((prev) => (prev.length === tops.length && prev.every((top, i) => Math.abs(top - tops[i]) < 0.5) ? prev : tops))
    }
    let frame = window.requestAnimationFrame(sync)
    const schedule = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(sync)
    }
    editor.on('update', schedule)
    window.addEventListener('resize', schedule)
    const resize = new ResizeObserver(schedule)
    resize.observe(editor.view.dom)
    return () => {
      window.cancelAnimationFrame(frame)
      editor.off('update', schedule)
      window.removeEventListener('resize', schedule)
      resize.disconnect()
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
    <div className={containerClassName} style={containerStyle} data-editor-scope={scopeId}>
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
          /* Header art steps back from where its zone starts to the page corner
             (lib/pageLayout zoneHtml). The first page's header sits in the text
             column; every other page's zone starts at the page edge, so its art
             must not step back by the left margin (page numbers landed 1.25in
             left of Word's). */
          .rm-with-pagination .rm-page-header:not(.rm-first-page-header) {
            --intellidocs-zone-left: 0px;
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
            display: block;
            column-span: all;
            break-inside: avoid;
          }
          .ProseMirror.ieee-columns-draft .ieee-span {
            column-span: all;
          }
          ${scopeCss(layout ? numberingCss(tabNumbered && tabNumbering ? layoutForTab(layout, tabNumbering) : layout, measure) : romanStyle, scopeId)}
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
      {showGridlines && (
        <div
          ref={gridLayerRef}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        >
          {Array.from({ length: gridPageCount }).map((_, index) => {
            const column = spreadPreview ? index % 2 : 0
            const row = spreadPreview ? Math.floor(index / 2) : index
            // Single pages use the measured sheet tops; the spread preview keeps its fixed grid.
            const measured = spreadPreview ? undefined : gridPageTops[index]
            const sheetTop = measured ?? row * (page.height + (spreadPreview ? SPREAD_GAP : PAGE_GAP))
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
      <MathEditPopover editor={editor} />
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
