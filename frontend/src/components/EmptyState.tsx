import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  body: string
  /** Optional call to action (usually a Button). */
  action?: ReactNode
}

/** An invitation rather than an apology: says what this space is for and what to do next. */
export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <h3 className="m-0 text-base font-semibold text-foreground">{title}</h3>
      <p className="m-0 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
