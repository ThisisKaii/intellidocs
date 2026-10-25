import { useEffect, useState, type FormEvent } from 'react'
import { ClipboardCheck, FileText, Plus } from 'lucide-react'
import { api } from '@/services/api'
import { EmptyState } from '@/components/EmptyState'
import ThesisChecklist, { type ComplianceReport } from '@/components/ThesisChecklist'
import type { ClassData } from './useProfessorWorkspace'

interface ThesisTemplate {
  id: string
  name: string
  fontFamily: string
  fontSize: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  lineSpacing: number
  mandatoryHeadings: string[]
}

const DEFAULT_TEMPLATES: ThesisTemplate[] = [
  { id: 'apa-7th', name: 'APA 7th Edition', fontFamily: 'Times New Roman', fontSize: 12, marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1, lineSpacing: 2, mandatoryHeadings: ['Abstract', 'Introduction', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'] },
  { id: 'bscs-capstone-2026', name: 'BSCS Capstone Thesis 2026', fontFamily: 'Times New Roman', fontSize: 12, marginTop: 1, marginBottom: 1, marginLeft: 1.5, marginRight: 1, lineSpacing: 2, mandatoryHeadings: ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'] },
]

const NEW_TEMPLATE = { name: '', headings: 'Abstract\nIntroduction\nMethodology\nResults\nDiscussion\nConclusion\nReferences', marginLeft: 1, lineSpacing: 2 }

/** Custom rubrics are kept in this browser per professor; the built-in ones are always present. */
function storageKey(userId: string): string {
  return `intellidocs.rubrics.${userId}`
}

/** Read the professor's saved rubrics, ignoring anything unreadable. */
function loadCustom(userId: string): ThesisTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as ThesisTemplate[]) : []
  } catch {
    return []
  }
}

/** Rubric templates (saved on this device) and the compliance audit against a submission. */
export function CompliancePanel({ classes, userId }: { classes: ClassData[]; userId: string }): JSX.Element {
  const [custom, setCustom] = useState<ThesisTemplate[]>(() => loadCustom(userId))
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState(NEW_TEMPLATE)
  const [docId, setDocId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [error, setError] = useState('')

  const templates = [...DEFAULT_TEMPLATES, ...custom]
  const submissions = classes.flatMap((c) => c.submissions.map((doc) => ({ id: doc.id, title: doc.title, className: c.folder.name })))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(custom))
    } catch { /* storage unavailable: rubrics last for this session only */ }
  }, [custom, userId])

  /** Save a new rubric built from the form. */
  function createTemplate(event: FormEvent): void {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the template a name')
      return
    }
    setCustom((current) => [...current, {
      id: `custom-${Date.now()}`, name: draft.name.trim(), fontFamily: 'Times New Roman', fontSize: 12,
      marginTop: 1, marginBottom: 1, marginLeft: draft.marginLeft, marginRight: 1, lineSpacing: draft.lineSpacing,
      mandatoryHeadings: draft.headings.split('\n').map((h) => h.trim()).filter(Boolean),
    }])
    setDraft(NEW_TEMPLATE)
    setShowForm(false)
    setError('')
  }

  /** Audit the chosen submission against the chosen rubric. */
  async function runAudit(): Promise<void> {
    const template = templates.find((t) => t.id === templateId)
    if (!docId || !template) return
    setAuditing(true)
    setReport(null)
    setError('')
    try {
      setReport(await api.professor.auditCompliance({ documentId: docId, mandatoryHeadings: template.mandatoryHeadings, referenceStyle: 'apa', requiredMarginInches: template.marginLeft, referencesRequired: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed')
    } finally {
      setAuditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Rubric templates</h2>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-3.5" /> New template
          </button>
        </div>

        {showForm && (
          <form onSubmit={createTemplate} className="mb-4 grid gap-3 rounded-lg border border-border bg-secondary/50 p-4">
            <input aria-label="Template name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. BSCS Capstone 2026" className="settings-input h-10" />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Left margin (in)
                <input type="number" step="0.1" value={draft.marginLeft} onChange={(e) => setDraft({ ...draft, marginLeft: parseFloat(e.target.value) || 1 })} className="settings-input mt-1 h-10 w-full" />
              </label>
              <label className="text-xs text-muted-foreground">Line spacing
                <input type="number" step="0.5" value={draft.lineSpacing} onChange={(e) => setDraft({ ...draft, lineSpacing: parseFloat(e.target.value) || 1 })} className="settings-input mt-1 h-10 w-full" />
              </label>
            </div>
            <label className="text-xs text-muted-foreground">Required headings, one per line
              <textarea rows={4} value={draft.headings} onChange={(e) => setDraft({ ...draft, headings: e.target.value })} className="settings-input mt-1 w-full resize-none font-mono" />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="h-8 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Save template</button>
              <button type="button" onClick={() => setShowForm(false)} className="h-8 rounded-md border border-border px-4 text-sm font-medium">Cancel</button>
            </div>
          </form>
        )}

        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <div>
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.fontFamily} {t.fontSize}pt · {t.lineSpacing}x spacing · left margin {t.marginLeft}&quot;</p>
                <p className="text-xs text-muted-foreground">Required: {t.mandatoryHeadings.join(', ')}</p>
              </div>
              {t.id.startsWith('custom-') && (
                <button type="button" onClick={() => setCustom((current) => current.filter((c) => c.id !== t.id))} className="text-xs font-medium text-muted-foreground hover:text-destructive">Remove</button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Your own templates are saved in this browser.</p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Compliance audit</h2>
        {submissions.length === 0 ? (
          <EmptyState icon={FileText} title="Nothing to audit yet" body="Submissions from your classes appear here once students add them." />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <select aria-label="Submission" value={docId} onChange={(e) => setDocId(e.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Choose a submission…</option>
                {submissions.map((s) => <option key={s.id} value={s.id}>{s.title || 'Untitled'} · {s.className}</option>)}
              </select>
              <select aria-label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Choose a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => { void runAudit() }} disabled={!docId || !templateId || auditing} className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <ClipboardCheck className="size-4" /> {auditing ? 'Auditing…' : 'Run compliance audit'}
            </button>
            {report && <ThesisChecklist report={report} />}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </section>
    </div>
  )
}
