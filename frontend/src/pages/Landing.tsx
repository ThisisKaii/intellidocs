import { Suspense, lazy } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { LogoLockup } from '../components/Logo'
import { Closing, Eyebrow, Faq, Features, HowItWorks } from '../components/landing/LandingSections'

// The demo ships its own editor, so it loads on demand to keep first paint fast.
const LandingDemo = lazy(() => import('../components/landing/LandingDemo'))

/** Public landing page: explains the product in plain language and lets visitors try it. */
export default function Landing(): JSX.Element {
  const { isAuthenticated, loading } = useAuth()

  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />

  const primaryHref = '/register'

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6" aria-label="Main">
          <LogoLockup size={28} />
          <div className="flex items-center gap-1 text-sm font-medium text-slate-600">
            <a href="#demo" className="hidden rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900 sm:block">Try it</a>
            <a href="#how" className="hidden rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900 sm:block">How it works</a>
            <a href="#faq" className="hidden rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900 md:block">FAQ</a>
            <Link to="/login" className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900">Sign in</Link>
            <Link to={primaryHref} className="ml-1 rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-white shadow-sm transition hover:bg-[var(--accent-hover)]">
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--accent-subtle),transparent_60%)] px-6 pb-16 pt-16 md:pb-24 md:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow>A word processor for school papers</Eyebrow>
            <h1 className="font-display text-balance text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Write your paper.
              <span className="block text-[var(--accent-strong)]">We&apos;ll handle the formatting.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 md:text-xl">
              IntelliDocs fixes your typos, sets up your paper the way your school wants it, and slowly learns how <em>you</em> like things to look, so you can spend your time on your ideas instead of margins and fonts.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to={primaryHref} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-strong)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-strong)]/20 transition hover:bg-[var(--accent-hover)]">
                Start writing — it&apos;s free <ArrowRight className="size-4" />
              </Link>
              <a href="#demo" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
                Try the demo below
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">No installation. Works in your browser.</p>
          </div>
        </section>

        {/* ── Interactive demo ─────────────────────────────────────── */}
        <section id="demo" className="scroll-mt-20 px-6 pb-20 md:pb-28">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <Eyebrow>Try it right now</Eyebrow>
              <h2 className="font-display text-balance text-2xl font-extrabold tracking-tight md:text-4xl">Fix a messy paper in three clicks</h2>
              <p className="mx-auto mt-3 max-w-xl text-pretty text-slate-600">Fix the mistakes, accept the suggestion, then pick a school format. This is the real thing, just smaller.</p>
            </div>
            <Suspense fallback={<div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-slate-50" aria-busy="true" />}>
              <LandingDemo />
            </Suspense>
          </div>
        </section>

        <HowItWorks />
        <Features />
        <Faq />
      </main>

      <Closing primaryHref={primaryHref} />
    </div>
  )
}
