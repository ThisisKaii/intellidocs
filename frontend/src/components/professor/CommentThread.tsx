import type { DocumentComment } from '@/services/api'
import { formatFeedbackTime } from '@/lib/rubric'

/** A submission's comments, oldest first, each with its author and time. */
export function CommentThread({ comments, emptyText = 'No comments yet.' }: { comments: DocumentComment[]; emptyText?: string }): JSX.Element {
  if (comments.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Comments">
      {comments.map((comment) => (
        <li key={comment.comment_id} className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="feedback-comment">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
            <span className="font-semibold text-foreground">{comment.author_name ?? 'Professor'}</span>
            <time dateTime={comment.created_at} className="text-muted-foreground">{formatFeedbackTime(comment.created_at)}</time>
          </div>
          {comment.highlighted_text && <p className="mb-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">{comment.highlighted_text}</p>}
          <p className="m-0 whitespace-pre-wrap">{comment.comment}</p>
        </li>
      ))}
    </ol>
  )
}
