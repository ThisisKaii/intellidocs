import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
}

/** One headline number on a dashboard overview. */
export function StatCard({ label, value, hint, icon: Icon }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
