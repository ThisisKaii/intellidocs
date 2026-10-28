import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Globe, Loader2, ShieldCheck } from 'lucide-react'
import {
  api,
  type DocumentRecord,
  type OriginalityPassageReview,
  type OriginalityResult,
  type OriginalityReview,
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

const VERDICT: Record<OriginalityPassageReview['verdict'], { label: string; color: string }> = {
  original: { label: 'Original', color: '#047857' },
  paraphrased: { label: 'Paraphrased', color: '#b45309' },
  reused: { label: 'Reused', color: '#b91c1c' },
  inconclusive: { label: 'Unclear', color: 'var(--muted-foreground)' },
}

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

type CheckMode = 'own' | 'online'

/**
 * View-only page: the document with every passage that overlaps one of the student's other documents,
 * or (online mode) a Wikipedia, scholarly or web source, highlighted.
 */
export default function Originality(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [mode, setMode] = useState<CheckMode>('own')
  const [result, setResult] = useState<OriginalityResult | null>(null)
  const [webResult, setWebResult] = useState<WebOriginalityResult | null>(null)
  const [review, setReview] = useState<OriginalityReview | null>(null)
  const [checking, setChecking] = useState<boolean>(false)
  const [webChecking, setWebChecking] = useState<boolean>(false)
  const [reviewing, setReviewing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({ extensions: VIEW_EXTENSIONS, content: '', editable: false })

  const passages = useMemo<HighlightedPassage[]>(() => {
    const shown: { paragraph_index: number; text: string }[] = (mode === 'online' ? webResult?.passages : result?.passages) ?? []
    return shown.map((passage) => ({ id: `${passage.paragraph_index}`, text: passage.text }))
  }, [mode, result, webResult])

  /** Search the web and scholarly sources for text copied into the document. */
  async function runWebCheck(): Promise<void> {
    setWebChecking(true)
    setError(null)
    try {
      setWebResult(await api.plagiarism.webCheck(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The online check failed.')
    } finally {
      setWebChecking(false)
    }
  }

  /** Run the originality check on the server. */
  const runCheck = useCallback(async (): Promise<void> => {
    setChecking(true)
    setError(null)
    setReview(null)
    try {
      setResult(await api.plagiarism.selfCheck(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The originality check failed.')
    } finally {
      setChecking(false)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    api.documents
      .get(id)
      .then((record) => {
        if (cancelled) return
        setDocument(record)
        void runCheck()
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open this document.')
      })
    return () => {
      cancelled = true
    }
  }, [id, runCheck])

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

  /** Ask the AI judges to explain what they found in the flagged passages. */
  async function getReview(): Promise<void> {
    setReviewing(true)
    setError(null)
    try {
      setReview(await api.plagiarism.selfCheckReview(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI review failed.')
    } finally {
      setReviewing(false)
    }
  }

  const reviewByParagraph = new Map((review?.reviews ?? []).map((item) => [item.paragraph_index, item]))

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
          title="Originality check"
          description={
            document
              ? `${document.title || 'Untitled document'} — ${mode === 'online' ? 'compared with Wikipedia, scholarly sources and the web.' : 'compared with your other documents only, not the internet.'}`
              : undefined
          }
          actions={
            mode === 'online' ? (
              <button
                type="button"
                onClick={() => void runWebCheck()}
                disabled={webChecking || !document}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium cursor-pointer hover:bg-muted disabled:cursor-default"
              >
                {webChecking ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
                {webChecking ? 'Searching online…' : webResult ? 'Check online again' : 'Check online'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runCheck()}
                disabled={checking || !document}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium cursor-pointer hover:bg-muted disabled:cursor-default"
              >
                {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {checking ? 'Checking…' : 'Check again'}
              </button>
            )
          }
        />
        <div role="tablist" aria-label="What to compare with" className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5">
          {([['own', 'Your documents'], ['online', 'Online sources']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer border-0 ${mode === key ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="originality-view overflow-x-auto rounded-xl border border-border bg-card p-4">
            <div className="mx-auto bg-white text-black shadow-sm" style={{ width: 816, maxWidth: '100%', padding: '48px 72px' }}>
              <EditorContent editor={editor} />
            </div>
          </div>

          {mode === 'online' ? (
            <aside className="flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                {webChecking ? (
                  <p className="m-0 text-sm text-muted-foreground">Searching Wikipedia, scholarly sources and the web. This can take up to a minute…</p>
                ) : webResult ? (
                  <>
                    {webResult.note ? (
                      <p className="m-0 text-sm text-muted-foreground">{webResult.note}</p>
                    ) : (
                      <p className="m-0 text-sm">
                        <strong>{webResult.overlap_percent}%</strong> matches published sources
                      </p>
                    )}
                    {!webResult.note && webResult.passages.length === 0 && (
                      <p className="mt-2 mb-0 text-sm text-muted-foreground">
                        No matching passages found in the {webResult.sources.length} source{webResult.sources.length === 1 ? '' : 's'} compared.
                      </p>
                    )}
                    <p className="mt-3 mb-1 text-xs font-semibold text-muted-foreground">Searched</p>
                    <ul className="m-0 list-none p-0 text-xs text-muted-foreground">
                      {webResult.providers.map((provider) => (
                        <li key={provider.name}>
                          {provider.status === 'searched' ? '✓' : '✗'} {provider.name}
                          {provider.status === 'not_configured' && ' — not set up yet'}
                          {provider.status === 'failed' && ` — unavailable${provider.message ? ` (${provider.message})` : ''}`}
                        </li>
                      ))}
                    </ul>
                    {webResult.providers.some((provider) => provider.kind === 'web' && provider.status !== 'searched') && (
                      <p className="mt-2 mb-0 text-xs text-muted-foreground">
                        General web pages were not searched, so a clean result here only covers the sources above. Ask the site administrator to set up web search.
                      </p>
                    )}
                    {webResult.truncated && (
                      <p className="mt-2 mb-0 text-xs text-muted-foreground">The check ran out of time, so some sources were skipped. Run it again to cover more.</p>
                    )}
                  </>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">
                    Press <strong>Check online</strong> to search Wikipedia, scholarly sources and the web for text copied into this document. It takes a few seconds to a minute.
                  </p>
                )}
              </div>

              {(webResult?.passages ?? []).map((passage) => (
                <button
                  key={`${passage.paragraph_index}-${passage.source_url}`}
                  type="button"
                  onClick={() => jumpTo(passage.paragraph_index)}
                  className="rounded-xl border border-border bg-card p-3 text-left cursor-pointer hover:bg-muted"
                >
                  <span className="block text-sm font-medium">
                    <span style={{ color: passage.match_type === 'verbatim' ? '#b91c1c' : '#b45309' }} className="font-bold">
                      {passage.match_type === 'verbatim' ? 'Copied' : 'Partly copied'} ·{' '}
                    </span>
                    {Math.round(passage.similarity)}% · {SOURCE_LABEL[passage.source_kind]}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">“{passage.text.slice(0, 140)}{passage.text.length > 140 ? '…' : ''}”</span>
                  <span className="mt-1 block text-xs">
                    Found in{' '}
                    {safeHref(passage.source_url) ? (
                      <a
                        href={safeHref(passage.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-primary underline break-all"
                      >
                        {passage.source_title || passage.source_url}
                      </a>
                    ) : (
                      <span className="break-all">{passage.source_title || passage.source_url}</span>
                    )}
                  </span>
                  {passage.source_excerpt && (
                    <span className="mt-1 block text-xs text-muted-foreground">Source: “{passage.source_excerpt.slice(0, 160)}{passage.source_excerpt.length > 160 ? '…' : ''}”</span>
                  )}
                </button>
              ))}
            </aside>
          ) : (
          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              {checking && !result ? (
                <p className="m-0 text-sm text-muted-foreground">Comparing your document…</p>
              ) : result?.compared_documents === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">
                  You have no other documents to compare this one with, so nothing was checked. Use <strong>Online sources</strong> above to search the web.
                </p>
              ) : result ? (
                <>
                  <p className="m-0 text-sm">
                    <strong>{result.overlap_percent}%</strong> overlap with your other documents
                  </p>
                  {result.passages.length === 0 && (
                    <p className="mt-2 mb-0 text-sm text-muted-foreground">No overlapping passages found.</p>
                  )}
                </>
              ) : null}
              {result && result.passages.length > 0 && !review && (
                <button
                  type="button"
                  onClick={() => void getReview()}
                  disabled={reviewing}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-muted disabled:cursor-default"
                >
                  {reviewing && <Loader2 className="size-3.5 animate-spin" />}
                  {reviewing ? 'Asking the AI judges…' : 'Get AI review'}
                </button>
              )}
            </div>

            {(result?.passages ?? []).map((passage) => {
              const judged = reviewByParagraph.get(passage.paragraph_index)
              const verdict = judged ? VERDICT[judged.verdict] : null
              return (
                <button
                  key={`${passage.paragraph_index}-${passage.peer_document_id}`}
                  type="button"
                  onClick={() => jumpTo(passage.paragraph_index)}
                  className="rounded-xl border border-border bg-card p-3 text-left cursor-pointer hover:bg-muted"
                >
                  <span className="block text-sm font-medium">
                    {verdict && (
                      <span style={{ color: verdict.color }} className="font-bold">
                        {verdict.label} ·{' '}
                      </span>
                    )}
                    {passage.peer_title || 'Untitled'} · {Math.round(passage.similarity)}%
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">“{passage.text.slice(0, 140)}{passage.text.length > 140 ? '…' : ''}”</span>
                  {judged?.reasoning && <span className="mt-1 block text-xs text-muted-foreground">{judged.reasoning}</span>}
                </button>
              )
            })}
          </aside>
          )}
        </div>
      </div>
    </div>
  )
}
