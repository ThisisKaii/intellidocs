import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenCheck, ChevronDown, FileUp, GraduationCap, Layers, ListChecks, PenLine, ShieldCheck, Sparkles, SpellCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LogoLockup } from '@/components/Logo'

/** Small mono label above each section heading. */
export function Eyebrow({ children }: { children: string }): JSX.Element {
  return <p className="font-tech mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">{children}</p>
}

/** Shared heading style: editorial display face, sentence case. */
export function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }): JSX.Element {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">{title}</h2>
      {intro ? <p className="mt-4 text-pretty text-lg text-slate-600">{intro}</p> : null}
    </div>
  )
}

const STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: PenLine,
    title: 'Write or bring your paper',
    body: 'Start typing, or upload the Word or PDF file you already have. It opens just as it looked.',
  },
  {
    icon: Sparkles,
    title: 'Get gentle suggestions',
    body: 'IntelliDocs points out mistakes and offers formatting fixes, each with a "how sure am I" percentage. You approve every change.',
  },
  {
    icon: BookOpenCheck,
    title: 'It learns your style',
    body: 'Every time you say yes or no, it learns. Over time it needs to ask less and gets more accurate.',
  },
]

/** Three plain-language steps that explain what the product does. */
export function HowItWorks(): JSX.Element {
  return (
    <section id="how" className="border-t border-slate-200 bg-white px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title="Think of it as a helpful classmate who loves formatting"
          intro="You focus on your ideas. IntelliDocs takes care of the fiddly parts, and never changes anything without asking."
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl border border-slate-200 bg-slate-50/60 p-7">
              <span className="font-tech absolute right-6 top-5 text-3xl font-bold text-slate-200">{index + 1}</span>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
                <step.icon className="size-5" />
              </span>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="text-pretty leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: SpellCheck, title: 'Fixes mistakes as you type', body: 'Typos, doubled words and clumsy sentences get a quiet underline. One click fixes them.' },
  { icon: Layers, title: 'One click for your school’s rules', body: 'APA, IEEE or your school’s own thesis format: margins, fonts, headings and spacing applied to the whole paper.' },
  { icon: FileUp, title: 'Opens Word and PDF files', body: 'Upload what you already have. Page breaks, tables, spacing and tab stops stay where they were.' },
  { icon: ListChecks, title: 'Learns how you like it', body: 'It notices your habits, like centering titles, and offers them next time with a confidence score.' },
  { icon: ShieldCheck, title: 'Saves as you go', body: 'Close the tab by accident and nothing is lost. Your papers stay private to you.' },
  { icon: GraduationCap, title: 'Made for classes', body: 'Professors can set up a class, collect submissions and check papers against the required format.' },
]

/** Plain-language feature cards. */
export function Features(): JSX.Element {
  return (
    <section id="features" className="border-t border-slate-200 bg-slate-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="What you get" title="Everything a school paper needs, nothing it doesn’t" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <feature.icon className="mb-4 size-6 text-[var(--accent-strong)]" />
              <h3 className="mb-1.5 font-semibold text-slate-900">{feature.title}</h3>
              <p className="text-pretty text-sm leading-relaxed text-slate-600">{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  { q: 'Is this like Microsoft Word or Google Docs?', a: 'It is a word processor you use in your browser, with one difference: it learns how you format your papers and offers to do it for you. It is not trying to replace Word; it fills the gap Word leaves.' },
  { q: 'Will it change my writing without asking?', a: 'No. Every suggestion shows what will change and how sure it is, and nothing happens until you say yes.' },
  { q: 'Do I need to install anything?', a: 'No. It runs in your web browser. Create a free account and start writing.' },
  { q: 'Can I use my existing Word or PDF files?', a: 'Yes. Upload them and they open with their pages, spacing, tables and tabs in place.' },
  { q: 'Who can see my papers?', a: 'Only you, unless you choose to share a paper. Checks happen inside IntelliDocs.' },
]

/** Collapsible answers to the questions first-time visitors ask. */
export function Faq(): JSX.Element {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="border-t border-slate-200 bg-white px-6 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Questions" title="Good to know" />
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.q}>
              <button
                type="button"
                aria-expanded={open === index}
                onClick={() => setOpen(open === index ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-medium text-slate-900 hover:bg-slate-50"
              >
                {item.q}
                <ChevronDown className={`size-5 shrink-0 text-slate-400 transition-transform ${open === index ? 'rotate-180' : ''}`} />
              </button>
              {open === index ? <p className="px-6 pb-5 text-pretty leading-relaxed text-slate-600">{item.a}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Closing call to action plus the footer. */
export function Closing({ primaryHref }: { primaryHref: string }): JSX.Element {
  return (
    <>
      <section className="bg-[var(--accent-strong)] px-6 py-20 text-center text-white md:py-24">
        <h2 className="font-display mx-auto max-w-2xl text-balance text-3xl font-extrabold tracking-tight md:text-5xl">Ready to stop fighting with formatting?</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">Create a free account and write your next paper in minutes.</p>
        <Link to={primaryHref} className="mt-8 inline-flex rounded-lg bg-white px-7 py-3.5 text-sm font-semibold text-[var(--accent-strong)] shadow-lg transition hover:bg-slate-100">
          Start writing — it&apos;s free
        </Link>
      </section>
      <footer className="border-t border-slate-200 bg-white px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-500 md:flex-row">
          <LogoLockup size={24} />
          <p>A capstone project of the College of Computer Studies, UCLM. © 2026 IntelliDocs</p>
          <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
        </div>
      </footer>
    </>
  )
}
