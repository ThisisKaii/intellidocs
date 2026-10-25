import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import {
  api,
  type DocumentRecord,
  type OriginalityPassageReview,
  type OriginalityResult,
  type OriginalityReview,
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

/** View-only page: the document with every passage that overlaps one of the student's other documents highlighted. */
export default function Originality(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [result, setResult] = useState<OriginalityResult | null>(null)
  const [review, setReview] = useState<OriginalityReview | null>(null)
  const [checking, setChecking] = useState<boolean>(false)
  const [reviewing, setReviewing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({ extensions: VIEW_EXTENSIONS, content: '', editable: false })

  const passages = useMemo<HighlightedPassage[]>(
    () => (result?.passages ?? []).map((passage) => ({ id: `${passage.paragraph_index}`, text: passage.text })),
    [result],
  )

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
          description={document ? `${document.title || 'Untitled document'} — compared with your other documents only, not the internet.` : undefined}
          actions={
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={checking || !document}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium cursor-pointer hover:bg-muted disabled:cursor-default"
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {checking ? 'Checking…' : 'Check again'}
            </button>
          }
        />
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="originality-view overflow-x-auto rounded-xl border border-border bg-card p-4">
            <div className="mx-auto bg-white text-black shadow-sm" style={{ width: 816, maxWidth: '100%', padding: '48px 72px' }}>
              <EditorContent editor={editor} />
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              {checking && !result ? (
                <p className="m-0 text-sm text-muted-foreground">Comparing your document…</p>
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
        </div>
      </div>
    </div>
  )
}
