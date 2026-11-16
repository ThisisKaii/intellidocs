import { useEffect, useRef, useState } from 'react'

import { api, type DocumentTabSummary, type EditorJson, type TabOutlineItem } from '@/services/api'
import type { PageLayoutData } from '@/lib/pageLayout'
import type { UnderlineStyle } from '@/lib/editorPreferences'
import { PagedEditor } from './PagedEditor'
import { documentOutline } from './DocumentParts'
import { findCaptions } from './captionNumbering'
import { PAGE_SIZES, type Editor, type HeaderFooterConfig, type MarginValues, type PageOrientation, type PageSizeKey } from './TiptapEditor'

/**
 * Lays out, one at a time and out of sight, the tabs of a document that were never opened, so
 * every tab knows how many pages it has, its headings and captions with their pages, and its
 * caption counts. A long manuscript the import split into tabs starts with none of that (the
 * converter does not paginate): without it the tabs after the first would number their pages, the
 * contents and the captions from the wrong place until each was opened.
 *
 * Only one hidden editor exists at any time, it starts once the open tab has had time to load, and
 * each tab waits for a pause in typing: the layout shares the page's main thread with the editor.
 */

export interface TabFacts {
  page_count: number
  outline: TabOutlineItem[]
  caption_counts: { figure: number; table: number }
}

interface TabLayoutMeasurerProps {
  documentId: string
  shareToken?: string | null
  tabs: DocumentTabSummary[]
  /** The tab in the editor (it reports its own pages). */
  activeTabId: string | null
  pageSize: PageSizeKey
  margins: MarginValues
  orientation: PageOrientation
  headerFooterConfig: HeaderFooterConfig
  pageLayout: PageLayoutData | null
  underlineStyle: UnderlineStyle
  onMeasured: (tabId: string, facts: TabFacts) => void
}

/** Wait after the document opens before laying out other tabs, so the open tab loads first. */
const START_DELAY_MS = 4000
/** How long the page count must stay the same (with every picture loaded) before a tab counts as laid out. */
const QUIET_MS = 4000
/** A new tab is only laid out once the person has stopped typing or clicking for this long. */
const IDLE_MS = 3000
/** A tab that has not settled by then is skipped (it is measured when opened). */
const GIVE_UP_MS = 180_000
const POLL_MS = 500

const noop = (): void => undefined

export default function TabLayoutMeasurer({
  documentId,
  shareToken,
  tabs,
  activeTabId,
  onMeasured,
  ...layout
}: TabLayoutMeasurerProps): JSX.Element | null {
  const [ready, setReady] = useState(false)
  const [current, setCurrent] = useState<{ tabId: string; content: string; json: EditorJson | null } | null>(null)
  // The tab whose body is loading. Held in state so a re-render of the page (typing re-renders it
  // constantly) cannot pick another tab and cancel the load in flight.
  const [pending, setPending] = useState<string | null>(null)
  // Tabs tried in this visit (measured, failed or skipped): never tried twice.
  const tried = useRef<Set<string>>(new Set())
  const editorRef = useRef<Editor | null>(null)
  const holder = useRef<HTMLDivElement | null>(null)
  const onMeasuredRef = useRef(onMeasured)
  onMeasuredRef.current = onMeasured
  // When the person last typed or clicked.
  const lastInput = useRef(0)

  useEffect(() => {
    const note = (): void => {
      lastInput.current = Date.now()
    }
    window.addEventListener('keydown', note, true)
    window.addEventListener('pointerdown', note, true)
    return () => {
      window.removeEventListener('keydown', note, true)
      window.removeEventListener('pointerdown', note, true)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [documentId])

  // Pick the next tab that has never been laid out...
  const nextId =
    ready && !current && !pending
      ? tabs.find((tab) => tab.page_count <= 0 && tab.tab_id !== activeTabId && !tried.current.has(tab.tab_id))?.tab_id
      : undefined
  useEffect(() => {
    if (!nextId) return
    let timer = 0
    const startWhenIdle = (): void => {
      const quietFor = Date.now() - lastInput.current
      if (quietFor < IDLE_MS) {
        timer = window.setTimeout(startWhenIdle, IDLE_MS - quietFor)
        return
      }
      tried.current.add(nextId)
      setPending(nextId)
    }
    startWhenIdle()
    return () => window.clearTimeout(timer)
  }, [nextId])

  // ...and load its body.
  useEffect(() => {
    if (!pending) return
    let cancelled = false
    api.documents.tabs
      .get(documentId, pending, shareToken)
      .then((loaded) => {
        if (cancelled) return
        setCurrent({ tabId: pending, content: loaded.content, json: loaded.content_json ?? null })
        setPending(null)
      })
      .catch(() => {
        // Measured when it is opened instead; go on with the next tab.
        if (!cancelled) setPending(null)
      })
    return () => {
      cancelled = true
    }
  }, [pending, documentId, shareToken])

  // Wait for the hidden editor's pages to stop changing, then report the tab and move on.
  useEffect(() => {
    if (!current) return
    const started = Date.now()
    let last = -1
    let since = Date.now()
    const timer = window.setInterval(() => {
      const editor = editorRef.current
      const pages = holder.current?.querySelectorAll('.rm-page-break').length ?? 0
      // Pictures still loading change the page count when they arrive.
      const picturesLoaded = Array.from(holder.current?.querySelectorAll('img') ?? []).every((image) => image.complete)
      if (pages !== last || !picturesLoaded) {
        last = pages
        since = Date.now()
      } else if (pages > 0 && editor && !editor.isDestroyed && Date.now() - since >= QUIET_MS) {
        const entries = findCaptions(editor.state.doc)
        onMeasuredRef.current(current.tabId, {
          page_count: pages,
          outline: documentOutline(editor).map(({ kind, level, text, page }) => ({ kind, level, text, page })),
          caption_counts: {
            figure: entries.filter((entry) => entry.kind === 'figure').length,
            table: entries.filter((entry) => entry.kind === 'table').length,
          },
        })
        setCurrent(null)
        return
      }
      if (Date.now() - started > GIVE_UP_MS) setCurrent(null)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [current])

  if (!current) return null
  const size = PAGE_SIZES[layout.pageSize] ?? PAGE_SIZES.letter
  const width = layout.orientation === 'landscape' ? size.height : size.width
  return (
    <div
      ref={holder}
      aria-hidden="true"
      // Laid out (so pages can be measured) but out of sight and out of reach.
      style={{ position: 'fixed', left: -100_000, top: 0, width: width + 200, visibility: 'hidden', pointerEvents: 'none', contain: 'layout style' }}
    >
      <PagedEditor
        key={current.tabId}
        scopeId={`measure-${current.tabId}`}
        content={current.content}
        contentJson={current.json}
        onContentChange={noop}
        onActiveEditorChange={(editor) => {
          editorRef.current = editor
          if (editor && !editor.isDestroyed) editor.setEditable(false)
        }}
        onGrammarClick={noop}
        grammarIssues={[]}
        underlineStyle={layout.underlineStyle}
        pageSize={layout.pageSize}
        margins={layout.margins}
        orientation={layout.orientation}
        headerFooterConfig={layout.headerFooterConfig}
        pageLayout={layout.pageLayout}
      />
    </div>
  )
}
