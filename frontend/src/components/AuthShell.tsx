import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { LogoMark } from './Logo'

const POINTS = [
  'Fixes typos and clumsy sentences as you type',
  'Matches APA, IEEE or your school’s format in one click',
  'Opens your Word and PDF files exactly as they were',
  'Learns your style, and always asks before changing anything',
]

/**
 * Split-screen frame shared by Login and Register: a calm brand panel that
 * explains the product on large screens, and the form centered on the right.
 */
export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid min-h-screen bg-[var(--canvas)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--accent-strong)] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-[var(--accent-mid)]/40 blur-3xl" aria-hidden />
        <Link to="/" className="relative flex items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
          <span className="rounded-[10px] ring-2 ring-white/70"><LogoMark size={34} /></span>
          IntelliDocs
        </Link>
        <div className="relative max-w-md">
          <h2 className="font-display text-balance text-4xl font-extrabold leading-tight tracking-tight">
            Your papers, formatted the way you like them.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-white/90">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Check className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">A capstone project of the College of Computer Studies, UCLM</p>
      </aside>
      <div className="relative flex items-center justify-center overflow-hidden p-6">{children}</div>
    </div>
  )
}
