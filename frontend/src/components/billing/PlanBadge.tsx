import { Sparkles } from 'lucide-react'
import type { Plan } from '@/services/api'

/** Small "Pro" pill shown next to the account for Pro subscribers; renders nothing on free. */
export function PlanBadge({ plan, className = '' }: { plan: Plan | undefined; className?: string }): JSX.Element | null {
  if (plan !== 'pro') return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 px-2 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm ${className}`}
      aria-label="Pro plan"
    >
      <Sparkles aria-hidden className="size-3" strokeWidth={2.25} />
      Pro
    </span>
  )
}
