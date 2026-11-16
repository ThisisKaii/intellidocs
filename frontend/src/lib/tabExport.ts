import { api, type DocumentTabSummary } from '@/services/api'

/**
 * What to download from a document split into tabs: the open tab, the whole document, or chosen
 * tabs (in document order). Every export format reads its body through `bodyForExport`, so they
 * all agree on what "this tab" or "the whole document" means.
 */
export type TabExportSelection = { kind: 'tab' } | { kind: 'whole' } | { kind: 'tabs'; tabIds: string[] }

/** The export formats the toolbar offers. */
export type ExportFormat = 'word' | 'ieeeWord' | 'thesisWord' | 'pdf' | 'html' | 'print'

export interface TabExportContext {
  documentId: string
  shareToken?: string | null
  tabs: DocumentTabSummary[]
  /** The tab open in the editor, and its live HTML (newer than the last save). */
  openTabId: string | null
  liveHtml: string
}

/** The tabs a selection covers, in document order. */
export function selectedTabs(selection: TabExportSelection, context: Pick<TabExportContext, 'tabs' | 'openTabId'>): DocumentTabSummary[] {
  if (selection.kind === 'whole') return context.tabs
  if (selection.kind === 'tab') return context.tabs.filter((tab) => tab.tab_id === context.openTabId)
  const wanted = new Set(selection.tabIds)
  return context.tabs.filter((tab) => wanted.has(tab.tab_id))
}

/**
 * The HTML to export: the chosen tabs joined in order. The open tab's text comes from the editor
 * (it may hold edits not saved yet); the others are fetched from the server.
 */
export async function bodyForExport(selection: TabExportSelection, context: TabExportContext): Promise<string> {
  const tabs = selectedTabs(selection, context)
  const bodies = await Promise.all(
    tabs.map(async (tab) =>
      tab.tab_id === context.openTabId ? context.liveHtml : (await api.documents.tabs.get(context.documentId, tab.tab_id, context.shareToken)).content,
    ),
  )
  return bodies.join('')
}

/** "Thesis – Chapter 3" for a single tab, the document title otherwise. */
export function exportTitle(documentTitle: string, selection: TabExportSelection, context: Pick<TabExportContext, 'tabs' | 'openTabId'>): string {
  const tabs = selectedTabs(selection, context)
  if (selection.kind !== 'whole' && tabs.length === 1) return `${documentTitle} – ${tabs[0].title}`
  return documentTitle
}
