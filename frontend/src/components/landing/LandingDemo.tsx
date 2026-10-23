import { useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Check, RotateCcw, Sparkles, X } from 'lucide-react'
import { DemoChecker, findDemoIssues } from './demoChecker'
import type { DemoIssue } from './demoChecker'

type PaperStyle = 'draft' | 'apa' | 'ieee'

const SAMPLE_HTML =
  '<p>my essay about the water cycle</p>' +
  '<p>water is very important for evrything living and it moves around the earth in a cycle that never stops. ' +
  'the the sun warms the water, it rises into the air, cools down, and falls back as rain. This is how we recieve fresh water.</p>'

const PAPER_STYLES: Array<{ key: PaperStyle; label: string; hint: string }> = [
  { key: 'draft', label: 'My draft', hint: 'Your paper as you typed it.' },
  { key: 'apa', label: 'APA', hint: 'Double spacing, indented paragraphs, centered bold title.' },
  { key: 'ieee', label: 'IEEE', hint: 'Compact, justified text with a centered title.' },
]

/** Scoped styles: the sample paper restyles itself when a format is picked. */
const DEMO_CSS = `
.demo-paper .ProseMirror { outline: none; min-height: 270px; padding: 28px 34px; color: #1c1917; transition: font-size .3s, line-height .3s; }
.demo-paper .ProseMirror p { margin: 0 0 .6em; }
.demo-paper .ProseMirror h1 { margin: 0 0 .6em; text-align: center; font-weight: 700; }
.demo-issue { text-decoration: underline wavy #dc2626; text-underline-offset: 4px; text-decoration-thickness: 1.5px; }
.demo-paper--draft .ProseMirror { font: 14px/1.25 'Segoe UI', system-ui, sans-serif; }
.demo-paper--draft .ProseMirror h1 { font-size: 17px; }
.demo-paper--apa .ProseMirror { font: 15px/2 'Times New Roman', Times, serif; }
.demo-paper--apa .ProseMirror p { text-indent: 2em; }
.demo-paper--apa .ProseMirror h1 { font-size: 17px; text-indent: 0; }
.demo-paper--ieee .ProseMirror { font: 13px/1.3 'Times New Roman', Times, serif; text-align: justify; }
.demo-paper--ieee .ProseMirror h1 { font-size: 16px; font-variant: small-caps; text-align: center; }
`

/** Title-case a plain sentence for the "make it a title" suggestion. */
function toTitleCase(text: string): string {
  return text.replace(/\b([a-z])([a-z']*)/g, (_m, first: string, rest: string) => first.toUpperCase() + rest)
}

/**
 * Interactive landing demo: a real (tiny) editor with the same ideas the app
 * uses, shown in plain language. Visitors can type, fix mistakes, approve or
 * decline a suggestion that carries a confidence score, and switch the paper
 * between formats. Nothing is sent anywhere.
 */
export default function LandingDemo(): JSX.Element {
  const [paperStyle, setPaperStyle] = useState<PaperStyle>('draft')
  const [titleDecision, setTitleDecision] = useState<'open' | 'accepted' | 'declined'>('open')

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1] } }), DemoChecker],
    content: SAMPLE_HTML,
    editorProps: { attributes: { 'aria-label': 'Sample paper — click and type to try it', spellcheck: 'false' } },
  })

  const snapshot = useEditorState({
    editor,
    selector: (ctx) => {
      const doc = ctx.editor?.state.doc
      return {
        issues: doc ? findDemoIssues(doc) : ([] as DemoIssue[]),
        titled: doc?.firstChild?.type.name === 'heading',
      }
    },
  })
  const issues = snapshot?.issues ?? []
  const titled = snapshot?.titled ?? false

  const tidiness = useMemo(() => {
    const penalty = issues.length * 14 + (titled ? 0 : 20) + (paperStyle === 'draft' ? 18 : 0)
    return Math.max(8, 100 - penalty)
  }, [issues.length, titled, paperStyle])

  /** Apply one fix: replace the underlined words with the corrected text. */
  function fixIssue(issue: DemoIssue): void {
    editor?.chain().focus().insertContentAt({ from: issue.from, to: issue.to }, issue.fix).run()
  }

  /** Accept the title suggestion: first line becomes a proper centered title. */
  function acceptTitle(): void {
    if (!editor) return
    const first = editor.state.doc.firstChild
    if (!first) return
    editor
      .chain()
      .focus()
      .insertContentAt({ from: 0, to: first.nodeSize }, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: toTitleCase(first.textContent) }] })
      .run()
    setTitleDecision('accepted')
  }

  /** Put the sample back exactly as it started. */
  function reset(): void {
    editor?.commands.setContent(SAMPLE_HTML)
    setPaperStyle('draft')
    setTitleDecision('open')
  }

  const showTitleSuggestion = !titled && titleDecision !== 'declined'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)]">
      <style>{DEMO_CSS}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
            <Sparkles className="size-3.5" />
          </span>
          Live demo — nothing here is saved or sent anywhere
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <RotateCcw className="size-3.5" /> Start over
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-5">
        {/* The paper */}
        <div className="border-b border-slate-200 bg-slate-50 p-4 md:col-span-3 md:border-b-0 md:border-r">
          <div className={`demo-paper demo-paper--${paperStyle} rounded-lg border border-slate-200 bg-white shadow-sm`}>
            <EditorContent editor={editor} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            This is a real editor — click the paper and type, or delete words, and watch the panel react.
          </p>
        </div>

        {/* The assistant */}
        <div className="flex flex-col gap-5 p-5 md:col-span-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Paper tidiness</span>
              <span className="font-tech text-[11px] text-[var(--accent-strong)]">{tidiness}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={tidiness} aria-valuemin={0} aria-valuemax={100} aria-label="Paper tidiness">
              <div className="h-full rounded-full bg-[var(--accent-strong)] transition-all duration-500" style={{ width: `${tidiness}%` }} />
            </div>
          </div>

          <section aria-label="Mistakes found">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">1 · Mistakes it spotted</h3>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <Check className="size-4" /> No mistakes left. Nice.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {issues.map((issue) => (
                  <li key={`${issue.from}-${issue.word}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {issue.kind === 'repeat' ? 'Repeated word' : 'Spelling'}: <strong className="font-semibold text-red-600">{issue.word}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => fixIssue(issue)}
                      className="shrink-0 rounded-md bg-[var(--accent-strong)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                    >
                      Fix → {issue.fix}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Formatting suggestion">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">2 · A suggestion for you</h3>
            {showTitleSuggestion ? (
              <div className="rounded-lg border border-[var(--accent-strong)]/25 bg-[var(--accent-subtle)] p-3">
                <p className="text-sm font-medium text-slate-800">Turn the first line into a centered title?</p>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-semibold text-[var(--accent-strong)]">92% sure</span> — you did this on your last 4 papers.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={acceptTitle} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-strong)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]">
                    <Check className="size-3.5" /> Yes, do it
                  </button>
                  <button type="button" onClick={() => setTitleDecision('declined')} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <X className="size-3.5" /> Not now
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {titled
                  ? 'Done. It also remembers that you liked this, so it asks with more confidence next time.'
                  : 'No problem — it will ask less often about titles.'}
              </p>
            )}
          </section>

          <section aria-label="School format">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">3 · Match your school's format</h3>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Paper format">
              {PAPER_STYLES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={paperStyle === option.key}
                  onClick={() => setPaperStyle(option.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    paperStyle === option.key ? 'bg-white text-[var(--accent-strong)] shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{PAPER_STYLES.find((option) => option.key === paperStyle)?.hint}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
