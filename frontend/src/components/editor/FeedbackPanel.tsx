import type { DocumentFeedback } from '@/services/api'
import { CommentThread } from '@/components/professor/CommentThread'
import { formatFeedbackTime, RUBRIC_CRITERIA, RUBRIC_MAX } from '@/lib/rubric'

/** True when there is anything for the Feedback tab to show. */
export function hasFeedback(feedback: DocumentFeedback | null | undefined): feedback is DocumentFeedback {
  return Boolean(feedback && (feedback.review || feedback.comments.length > 0))
}

/** The professor's grade, rubric, notes and comments on this submission, as the student sees them. */
export function FeedbackPanel({ feedback }: { feedback: DocumentFeedback }): JSX.Element {
  const { review, comments } = feedback
  return (
    <div className="flex flex-col gap-4 p-3" data-testid="feedback-panel">
      {review && (
        <section className="rounded-xl border border-border bg-card p-3" aria-label="Grade">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-sm font-semibold">Grade</h3>
            {review.grade !== null && (
              <span className="text-2xl font-bold tabular-nums" data-testid="feedback-grade">
                {Number(review.grade)}
                <span className="text-sm font-medium text-muted-foreground">/100</span>
              </span>
            )}
          </div>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {review.reviewer_name ? `${review.reviewer_name} · ` : ''}
            <time dateTime={review.reviewed_at}>{formatFeedbackTime(review.reviewed_at)}</time>
          </p>

          {review.rubric && (
            <dl className="m-0 mt-3 grid grid-cols-2 gap-2" aria-label="Rubric">
              {RUBRIC_CRITERIA.map(({ key, label, hint }) => (
                <div key={key} className="rounded-lg bg-secondary px-2.5 py-2" title={hint}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="m-0 text-sm font-semibold tabular-nums">
                    {review.rubric?.[key]}
                    <span className="font-normal text-muted-foreground">/{RUBRIC_MAX}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {review.notes && (
            <div className="mt-3">
              <h4 className="m-0 mb-1 text-xs font-semibold text-muted-foreground">Notes</h4>
              <p className="m-0 whitespace-pre-wrap text-sm">{review.notes}</p>
            </div>
          )}
        </section>
      )}

      <section aria-label="Comments" className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">Comments</h3>
        <CommentThread comments={comments} emptyText="Your professor has not left comments yet." />
      </section>
    </div>
  )
}
