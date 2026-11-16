import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { api, type DocumentTabSummary, type EditorJson } from '@/services/api'
import type { PageLayoutData } from '@/lib/pageLayout'
import { resolveTabNumbering, type ResolvedTabNumbering } from '@/lib/tabNumbering'
import type { UnderlineStyle } from '@/lib/editorPreferences'
import { PagedEditor } from './PagedEditor'
import {
  PAGE_SIZES,
  type Editor,
  type HeaderFooterConfig,
  type MarginValues,
  type PageOrientation,
  type PageSizeKey,
} from './TiptapEditor'

/**
 * The whole of a document split into tabs, read-only, one tab under another — for reading it
 * through or printing. A tab is laid out only while it is near the screen (each is a full editor);
 * the others are placeholders as tall as their pages, so even a thousand-page manuscript scrolls.
 */

interface WholeDocumentViewProps {
  documentId: string
  shareToken?: string | null
  tabs: DocumentTabSummary[]
  defaultFormat: ResolvedTabNumbering['format']
  pageSize: PageSizeKey
  margins: MarginValues
  orientation: PageOrientation
  headerFooterConfig: HeaderFooterConfig
  pageLayout: PageLayoutData | null
  underlineStyle: UnderlineStyle
  /** Open a tab in the editor (the "Edit" link on each tab). */
  onEditTab: (tabId: string) => void
}

/** Gap between page sheets in the paged editor, in px (PagedEditor's PAGE_GAP). */
const PAGE_GAP = 40
/** How far outside the screen a tab is laid out ahead of scrolling to it. */
const MOUNT_MARGIN = '1500px 0px'

const noop = (): void => undefined
const makeReadOnly = (editor: Editor | null): void => {
  if (editor && !editor.isDestroyed) editor.setEditable(false)
}

function TabSection({
  documentId,
  shareToken,
  tab,
  numbering,
  pageHeight,
  shared,
  onEditTab,
}: {
  documentId: string
  shareToken?: string | null
  tab: DocumentTabSummary
  numbering: ResolvedTabNumbering | null
  pageHeight: number
  shared: Omit<WholeDocumentViewProps, 'documentId' | 'shareToken' | 'tabs' | 'defaultFormat' | 'onEditTab'>
  onEditTab: (tabId: string) => void
}): JSX.Element {
  const holder = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)
  const [body, setBody] = useState<{ content: string; json: EditorJson | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = holder.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), { rootMargin: MOUNT_MARGIN })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!near || body) return
    let cancelled = false
    api.documents.tabs
      .get(documentId, tab.tab_id, shareToken)
      .then((loaded) => {
        if (!cancelled) setBody({ content: loaded.content, json: loaded.content_json ?? null })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'This tab could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [near, body, documentId, tab.tab_id, shareToken])

  const placeholderHeight = Math.max(1, tab.page_count || 1) * (pageHeight + PAGE_GAP)

  return (
    <section aria-label={tab.title} style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.75rem', margin: '0 0 0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          {tab.title}
        </h2>
        <button
          type="button"
          onClick={() => onEditTab(tab.tab_id)}
          style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          Edit this tab
        </button>
      </div>
      <div ref={holder} style={{ minHeight: near && body ? undefined : placeholderHeight }}>
        {error ? (
          <p role="alert" style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--destructive, #dc2626)' }}>
            {error}
          </p>
        ) : near && body ? (
          <PagedEditor
            scopeId={`whole-${tab.tab_id}`}
            content={body.content}
            contentJson={body.json}
            onContentChange={noop}
            onActiveEditorChange={makeReadOnly}
            onGrammarClick={noop}
            grammarIssues={[]}
            underlineStyle={shared.underlineStyle}
            pageSize={shared.pageSize}
            margins={shared.margins}
            orientation={shared.orientation}
            headerFooterConfig={shared.headerFooterConfig}
            pageLayout={shared.pageLayout}
            tabNumbering={numbering}
          />
        ) : near ? (
          <div role="status" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', paddingTop: '3rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
            <Loader2 className="animate-spin" style={{ width: '16px', height: '16px' }} /> Loading {tab.title}…
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default function WholeDocumentView({
  documentId,
  shareToken,
  tabs,
  defaultFormat,
  onEditTab,
  ...shared
}: WholeDocumentViewProps): JSX.Element {
  const size = PAGE_SIZES[shared.pageSize] ?? PAGE_SIZES.letter
  const pageHeight = shared.orientation === 'landscape' ? size.width : size.height
  return (
    <div aria-label="Whole document (read-only)">
      {tabs.map((tab) => (
        <TabSection
          key={tab.tab_id}
          documentId={documentId}
          shareToken={shareToken}
          tab={tab}
          numbering={resolveTabNumbering(tabs, tab.tab_id, defaultFormat)}
          pageHeight={pageHeight}
          shared={shared}
          onEditTab={onEditTab}
        />
      ))}
    </div>
  )
}
