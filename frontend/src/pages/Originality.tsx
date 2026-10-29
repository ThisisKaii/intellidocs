import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, BookOpen, FileText, Globe, Layers, Loader2 } from 'lucide-react'
import {
  api,
  type DocumentRecord,
  type WebCheckOptions,
  type WebOriginalityResult,
  type WebSourceKind,
} from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import {
  OriginalityHighlightExtension,
  originalityHighlightKey,
  type HighlightedPassage,
} from '@/components/editor/OriginalityHighlightExtension'

/** Extensions that react to typing or run checks; a view-only page needs none of them. */
const INTERACTIVE_EXTENSIONS = new Set([
  'grammarUnderline',
  'suggestionDecorations',
  'blueprintGuides',
  'harperLinter',
  'styleGuide',
  'academicMarkdownTriggers',
])

const VIEW_EXTENSIONS = [
  ...editorExtensions.filter((extension) => !INTERACTIVE_EXTENSIONS.has(extension.name)),
  OriginalityHighlightExtension,
]

const SOURCE_LABEL: Record<WebSourceKind, string> = {
  wikipedia: 'Wikipedia',
  arxiv: 'arXiv',
  openalex: 'OpenAlex',
  web: 'Web',
}

/** Only real web links become clickable; anything else is shown as plain text. */
function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? url : undefined
}

type CheckScope = 'all' | 'chapter' | 'pages'

/**
 * View-only page: compares the document (or a targeted chapter/page range) against
 * Wikipedia, scholarly sources (OpenAlex, arXiv) and the web, highlighting matches.
 */
export default function Originality(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [webResult, setWebResult] = useState<WebOriginalityResult | null>(null)
  const [webChecking, setWebChecking] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Scope controls
  const [scope, setScope] = useState<CheckScope>('all')
  const [selectedChapter, setSelectedChapter] = useState<string>('')
  const [pageStart, setPageStart] = useState<number>(1)
  const [pageEnd, setPageEnd] = useState<number>(5)
  const [activeScopeLabel, setActiveScopeLabel] = useState<string>('')

  const editor = useEditor({ extensions: VIEW_EXTENSIONS, content: '', editable: false })

  // Extract chapters / major sections from headings in the document
  const chapters = useMemo<string[]>(() => {
    if (!document?.content) return []
    const matches = [...document.content.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    const seen = new Set<string>()
    const list: string[] = []
    for (const m of matches) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (text && !seen.has(text)) {
        seen.add(text)
        list.push(text)
      }
    }
    return list
  }, [document?.content])

  // Estimate total pages in the manuscript (by page break markers or ~250 words per page)
  const estimatedTotalPages = useMemo<number>(() => {
    if (!document?.content) return 1
    const breaks = (document.content.match(/class="[^"]*(?:intellidocs-page-break|page-break|rm-page-break)[^"]*"/gi) ?? []).length
    if (breaks > 0) return breaks + 1
    const words = document.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
    return Math.max(1, Math.ceil(words / 250))
  }, [document?.content])

  // Auto-select first chapter when chapters become available
  useEffect(() => {
    if (chapters.length > 0 && !selectedChapter) {
      setSelectedChapter(chapters[0])
    }
  }, [chapters, selectedChapter])

  const passages = useMemo<HighlightedPassage[]>(() => {
    const shown: { paragraph_index: number; text: string }[] = webResult?.passages ?? []
    return shown.map((passage) => ({ id: `${passage.paragraph_index}`, text: passage.text }))
  }, [webResult])

  /** Search the web and scholarly sources for text copied into the document. */
  async function runWebCheck(): Promise<void> {
    setWebChecking(true)
    setError(null)
    const options: WebCheckOptions = {
      scope,
      chapterTitle: scope === 'chapter' ? selectedChapter : undefined,
      pageStart: scope === 'pages' ? pageStart : undefined,
      pageEnd: scope === 'pages' ? pageEnd : undefined,
    }

    if (scope === 'chapter' && selectedChapter) {
      setActiveScopeLabel(`Chapter: ${selectedChapter}`)
    } else if (scope === 'pages') {
      setActiveScopeLabel(`Pages ${pageStart}–${pageEnd}`)
    } else {
      setActiveScopeLabel('Entire document')
    }

    try {
      setWebResult(await api.plagiarism.webCheck(id, options))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The online check failed.')
    } finally {
      setWebChecking(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api.documents
      .get(id)
      .then((record) => {
        if (cancelled) return
        setDocument(record)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open this document.')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !document) return
    editor.commands.setContent(document.content || '', { emitUpdate: false })
  }, [editor, document])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(originalityHighlightKey, passages))
  }, [editor, passages, document])

  /** Scroll the highlighted passage into view when its list entry is clicked. */
  function jumpTo(paragraphIndex: number): void {
    const target = window.document.querySelector(`[data-passage-id="${paragraphIndex}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        .originality-passage { background: rgba(245, 158, 11, 0.28); border-radius: 2px; }
        .originality-view .ProseMirror { outline: none; }
      `}</style>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Link
          to={`/document/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to the document
        </Link>
        <PageHeader
          title="Online Originality Check"
          description={
            document
              ? `${document.title || 'Untitled document'} — Search Wikipedia, arXiv, OpenAlex, and the web for matching sources.`
              : undefined
          }
          actions={
            <button
              type="button"
              onClick={() => void runWebCheck()}
              disabled={webChecking || !document}
              className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {webChecking ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
              {webChecking ? 'Searching online…' : webResult ? 'Check online again' : 'Check online'}
            </button>
          }
        />

        {/* Scope Selector Card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scope:</span>
              <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer border-0 transition-colors ${
                    scope === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="size-3.5" /> Entire document
                </button>
                <button
                  type="button"
                  onClick={() => setScope('chapter')}
                  disabled={chapters.length === 0}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer border-0 transition-colors disabled:opacity-50 ${
                    scope === 'chapter' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BookOpen className="size-3.5" /> By Chapter
                </button>
                <button
                  type="button"
                  onClick={() => setScope('pages')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer border-0 transition-colors ${
                    scope === 'pages' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="size-3.5" /> By Page Range
                </button>
              </div>
            </div>

            {/* Sub-controls based on chosen scope */}
            {scope === 'chapter' && (
              <div className="flex items-center gap-2">
                <label htmlFor="chapter-select" className="text-xs text-muted-foreground whitespace-nowrap">
                  Target Chapter:
                </label>
                <select
                  id="chapter-select"
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[280px] truncate"
                >
                  {chapters.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'pages' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">From page</span>
                <input
                  type="number"
                  min={1}
                  max={pageEnd}
                  value={pageStart}
                  onChange={(e) => setPageStart(Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="number"
                  min={pageStart}
                  max={Math.min(estimatedTotalPages, pageStart + 9)}
                  value={pageEnd}
                  onChange={(e) => setPageEnd(Math.max(pageStart, Number(e.target.value)))}
                  className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-muted-foreground text-[11px]">(of ~{estimatedTotalPages} pages, max 10)</span>
              </div>
            )}
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="originality-view overflow-x-auto rounded-xl border border-border bg-card p-4">
            <div className="mx-auto bg-white text-black shadow-sm" style={{ width: 816, maxWidth: '100%', padding: '48px 72px' }}>
              <EditorContent editor={editor} />
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              {webChecking ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>Searching online sources for {activeScopeLabel || 'selected content'}…</span>
                </div>
              ) : webResult ? (
                <>
                  {activeScopeLabel && (
                    <div className="mb-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <span>Checked: {activeScopeLabel}</span>
                    </div>
                  )}
                  {webResult.note ? (
                    <p className="m-0 text-sm text-muted-foreground">{webResult.note}</p>
                  ) : (
                    <p className="m-0 text-sm">
                      <strong className="text-lg">{webResult.overlap_percent}%</strong> match with published sources
                    </p>
                  )}
                  {!webResult.note && webResult.passages.length === 0 && (
                    <p className="mt-2 mb-0 text-sm text-muted-foreground">
                      No matching passages found in the {webResult.sources.length} source{webResult.sources.length === 1 ? '' : 's'} compared.
                    </p>
                  )}
                  <p className="mt-3 mb-1 text-xs font-semibold text-muted-foreground">Searched Services</p>
                  <ul className="m-0 list-none p-0 text-xs text-muted-foreground space-y-0.5">
                    {webResult.providers.map((provider) => (
                      <li key={provider.name} className="flex items-center gap-1.5">
                        <span className={provider.status === 'searched' ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                          {provider.status === 'searched' ? '✓' : '✗'}
                        </span>
                        <span>{provider.name}</span>
                        {provider.status === 'not_configured' && <span className="text-muted-foreground">— not configured</span>}
                        {provider.status === 'failed' && <span className="text-rose-400">— unavailable</span>}
                      </li>
                    ))}
                  </ul>
                  {webResult.truncated && (
                    <p className="mt-2 mb-0 text-xs text-amber-500">
                      The check reached the time limit; some sources were skipped. Run again to cover more.
                    </p>
                  )}
                </>
              ) : (
                <div className="py-2">
                  <p className="m-0 text-sm font-medium">Ready to scan</p>
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    Select a scope above (Entire Document, Chapter, or Page Range) and press <strong>Check online</strong>.
                    Targeting a 5-page range or literature chapter gives the deepest search coverage.
                  </p>
                </div>
              )}
            </div>

            {(webResult?.passages ?? []).map((passage) => (
              <button
                key={`${passage.paragraph_index}-${passage.source_url}`}
                type="button"
                onClick={() => jumpTo(passage.paragraph_index)}
                className="rounded-xl border border-border bg-card p-3 text-left cursor-pointer transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span
                    className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      passage.match_type === 'verbatim' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {passage.match_type === 'verbatim' ? 'Verbatim' : 'Paraphrased'} · {Math.round(passage.similarity)}%
                  </span>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{SOURCE_LABEL[passage.source_kind]}</span>
                </div>
                <span className="block text-xs font-serif text-foreground line-clamp-3 italic">
                  “{passage.text}”
                </span>
                <span className="mt-2 block text-xs">
                  Source:{' '}
                  {safeHref(passage.source_url) ? (
                    <a
                      href={safeHref(passage.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-primary underline break-all font-medium hover:text-primary/80"
                    >
                      {passage.source_title || passage.source_url}
                    </a>
                  ) : (
                    <span className="break-all font-medium">{passage.source_title || passage.source_url}</span>
                  )}
                </span>
                {passage.source_excerpt && (
                  <span className="mt-1 block text-[11px] text-muted-foreground line-clamp-2">
                    Matched text: “{passage.source_excerpt}”
                  </span>
                )}
              </button>
            ))}
          </aside>
        </div>
      </div>
    </div>
  )
}
