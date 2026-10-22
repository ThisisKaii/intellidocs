import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** Buttons or controls shown on the right of the title. */
  actions?: ReactNode
}

/** Standard page title block: sentence-case title, one line of context, optional actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-2xl font-semibold normal-case tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
