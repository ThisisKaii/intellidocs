import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { api, type DocumentComment, type DocumentReview } from '@/services/api'

export interface GradeTarget {
  documentId: string
  studentId: string
  studentName: string
  title: string
  className: string
}

interface GradeDrawerProps {
  target: GradeTarget
  onClose: () => void
  /** Called with the saved review so the table can show the new grade. */
  onGraded: (documentId: string, review: DocumentReview) => void
}

/** Side panel for grading one submission and leaving comments for the student. */
export function GradeDrawer({ target, onClose, onGraded }: GradeDrawerProps): JSX.Element {
  const [grade, setGrade] = useState('')
  const [notes, setNotes] = useState('')
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.professor.getReview(target.documentId).catch(() => null),
      api.professor.getComments(target.documentId).catch(() => []),
    ]).then(([review, existing]) => {
      if (cancelled) return
      setGrade(review?.grade != null ? String(review.grade) : '')
      setNotes(review?.notes ?? '')
      setComments(existing)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [target.documentId])

  /** Save the grade and notes; the grade must be a number from 0 to 100. */
  async function saveGrade(): Promise<void> {
    const value = Number(grade)
    if (grade.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('Enter a grade between 0 and 100')
      return
    }
    setSaving(true)
    setError('')
    try {
      const review = await api.professor.submitGrade(target.documentId, target.studentId, value, notes.trim() || undefined)
      onGraded(target.documentId, review)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the grade')
    } finally {
      setSaving(false)
    }
  }

  /** Add a comment on the whole document. */
  async function postComment(): Promise<void> {
    const text = newComment.trim()
    if (!text) return
    setError('')
    try {
      const created = await api.professor.addComment(target.documentId, text)
      setComments((current) => [...current, created])
      setNewComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the comment')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-label="Grade submission" className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{target.title || 'Untitled'}</h2>
            <p className="text-xs text-muted-foreground">{target.studentName} · {target.className}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <Link to={`/document/${target.documentId}`} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary no-underline hover:underline">
          <ExternalLink className="size-3.5" /> Open the document
        </Link>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="grade-value" className="text-sm font-medium">Grade (0-100)</label>
              <input id="grade-value" type="number" min={0} max={100} value={grade} onChange={(e) => setGrade(e.target.value)} className="settings-input h-10 w-32" />
              <label htmlFor="grade-notes" className="text-sm font-medium">Notes for the student</label>
              <textarea id="grade-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="settings-input resize-none" />
              <button type="button" onClick={() => { void saveGrade() }} disabled={saving} className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving && <Loader2 className="size-4 animate-spin" />} Save grade
              </button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Comments</h3>
              {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {comments.map((comment) => (
                <div key={comment.comment_id} className="rounded-lg border border-border bg-background p-3 text-sm">
                  {comment.highlighted_text && <p className="mb-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">{comment.highlighted_text}</p>}
                  {comment.comment}
                </div>
              ))}
              <textarea aria-label="New comment" rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment on this submission" className="settings-input resize-none" />
              <button type="button" onClick={() => { void postComment() }} disabled={!newComment.trim()} className="h-9 w-fit rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
                Add comment
              </button>
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </aside>
    </div>
  )
}
