import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type DocumentRecord } from '../services/api'
import ThesisChecklist, { type ComplianceReport } from '../components/ThesisChecklist'
import {
  FileText,
  ClipboardCheck,
  ArrowLeft,
  RefreshCw,
  Plus,
  Search,
  Eye,
  GraduationCap,
} from 'lucide-react'

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
  createdAt: string
}

const DEFAULT_TEMPLATES: ThesisTemplate[] = [
  {
    id: 'apa-7th',
    name: 'APA 7th Edition',
    fontFamily: 'Times New Roman',
    fontSize: 12,
    marginTop: 1.0,
    marginBottom: 1.0,
    marginLeft: 1.0,
    marginRight: 1.0,
    lineSpacing: 2.0,
    mandatoryHeadings: ['Abstract', 'Introduction', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'bscs-capstone-2026',
    name: 'BSCS Capstone Thesis 2026',
    fontFamily: 'Times New Roman',
    fontSize: 12,
    marginTop: 1.0,
    marginBottom: 1.0,
    marginLeft: 1.5,
    marginRight: 1.0,
    lineSpacing: 2.0,
    mandatoryHeadings: ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'],
    createdAt: new Date().toISOString(),
  },
]

export default function ProfessorDashboard(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'templates' | 'audit' | 'reviews' | 'folders'>('templates')
  const [templates, setTemplates] = useState<ThesisTemplate[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Template builder state
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    fontFamily: 'Times New Roman',
    fontSize: 12,
    marginTop: 1.0,
    marginBottom: 1.0,
    marginLeft: 1.0,
    marginRight: 1.0,
    lineSpacing: 2.0,
    mandatoryHeadings: 'Abstract\nIntroduction\nMethodology\nResults\nDiscussion\nConclusion\nReferences',
  })

  // Audit state
  const [selectedDocId, setSelectedDocId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [auditResult, setAuditResult] = useState<ComplianceReport | null>(null)
  const [auditing, setAuditing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [docs] = await Promise.all([
        api.documents.list().catch(() => []),
      ])
      setDocuments(docs)
      setTemplates(DEFAULT_TEMPLATES)
    } catch {
      setMessage({ type: 'error', text: 'Failed to load professor workspace data' })
    } finally {
      setLoading(false)
    }
  }

  function handleCreateTemplate(e: FormEvent) {
    e.preventDefault()
    if (!newTemplate.name.trim()) {
      setMessage({ type: 'error', text: 'Template name is required' })
      return
    }
    const template: ThesisTemplate = {
      id: `custom-${Date.now()}`,
      name: newTemplate.name.trim(),
      fontFamily: newTemplate.fontFamily,
      fontSize: newTemplate.fontSize,
      marginTop: newTemplate.marginTop,
      marginBottom: newTemplate.marginBottom,
      marginLeft: newTemplate.marginLeft,
      marginRight: newTemplate.marginRight,
      lineSpacing: newTemplate.lineSpacing,
      mandatoryHeadings: newTemplate.mandatoryHeadings.split('\n').map(h => h.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    }
    setTemplates(prev => [...prev, template])
    setShowTemplateForm(false)
    setNewTemplate({
      name: '',
      fontFamily: 'Times New Roman',
      fontSize: 12,
      marginTop: 1.0,
      marginBottom: 1.0,
      marginLeft: 1.0,
      marginRight: 1.0,
      lineSpacing: 2.0,
      mandatoryHeadings: 'Abstract\nIntroduction\nMethodology\nResults\nDiscussion\nConclusion\nReferences',
    })
    setMessage({ type: 'success', text: `Template "${template.name}" created successfully` })
  }

  async function runComplianceAudit() {
    if (!selectedDocId || !selectedTemplateId) {
      setMessage({ type: 'error', text: 'Select both a document and a template to audit' })
      return
    }

    const template = templates.find(t => t.id === selectedTemplateId)
    if (!template) {
      setMessage({ type: 'error', text: 'The selected template is no longer available' })
      return
    }

    setAuditing(true)
    setAuditResult(null)
    try {
      // The server loads the document and runs both scoring tiers, so only the
      // template rules travel over the wire.
      const report = await api.professor.auditCompliance({
        documentId: selectedDocId,
        mandatoryHeadings: template.mandatoryHeadings,
        referenceStyle: 'apa',
        requiredMarginInches: template.marginLeft ?? 1,
        referencesRequired: true,
      })

      setAuditResult(report)
      setMessage({ type: 'success', text: `Compliance audit complete. Score: ${Math.round(report.aggregateScore)}%` })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Audit failed',
      })
    } finally {
      setAuditing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Professor Workspace</span>
          </div>
        </div>
        <Link to="/dashboard" className="text-sm font-medium text-muted-foreground no-underline hover:text-foreground">
          Exit to Dashboard
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Professor Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage thesis templates, run compliance audits, and review student documents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void loadData() }}
            disabled={loading}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border bg-background text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`rounded-lg p-3 mb-5 text-sm font-medium ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-700'
                : 'bg-red-500/10 border border-red-500/30 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {([
            ['templates', 'Template Rubrics', FileText],
            ['audit', 'Compliance Audit', ClipboardCheck],
            ['reviews', 'Document Reviews', Eye],
            ['folders', 'Classroom Folders', GraduationCap],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Template Rubrics */}
        {activeTab === 'templates' && (
          <div className="rounded-xl bg-card border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Formatting Rubric Templates</h2>
              <button
                type="button"
                onClick={() => setShowTemplateForm(!showTemplateForm)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" />
                New Template
              </button>
            </div>

            {showTemplateForm && (
              <form onSubmit={(e) => { void handleCreateTemplate(e) }} className="rounded-lg border border-border bg-secondary/50 p-4 mb-5">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Template Name</label>
                    <input
                      type="text"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. BSCS Capstone Thesis 2026"
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Font Family</label>
                    <input
                      type="text"
                      value={newTemplate.fontFamily}
                      onChange={(e) => setNewTemplate(p => ({ ...p, fontFamily: e.target.value }))}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    ['marginTop', 'Top (in)'],
                    ['marginBottom', 'Bottom (in)'],
                    ['marginLeft', 'Left (in)'],
                    ['marginRight', 'Right (in)'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{label}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newTemplate[key as keyof typeof newTemplate] as number}
                        onChange={(e) => setNewTemplate(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Font Size (pt)</label>
                    <input
                      type="number"
                      value={newTemplate.fontSize}
                      onChange={(e) => setNewTemplate(p => ({ ...p, fontSize: parseInt(e.target.value) || 12 }))}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Line Spacing</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newTemplate.lineSpacing}
                      onChange={(e) => setNewTemplate(p => ({ ...p, lineSpacing: parseFloat(e.target.value) || 1.0 }))}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mb-4">
                  <label className="text-xs font-medium text-muted-foreground">Mandatory Headings (one per line)</label>
                  <textarea
                    value={newTemplate.mandatoryHeadings}
                    onChange={(e) => setNewTemplate(p => ({ ...p, mandatoryHeadings: e.target.value }))}
                    rows={4}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                    Create Template
                  </button>
                  <button type="button" onClick={() => setShowTemplateForm(false)} className="h-8 px-4 rounded-md border border-border text-sm font-medium hover:bg-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.fontFamily} {t.fontSize}pt • {t.lineSpacing}x spacing • Margins: {t.marginLeft}"L / {t.marginRight}"R / {t.marginTop}"T / {t.marginBottom}"B
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Required sections: {t.mandatoryHeadings.join(', ')}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                    {t.mandatoryHeadings.length} sections
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Compliance Audit */}
        {activeTab === 'audit' && (
          <div className="rounded-xl bg-card border border-border p-6">
            <h2 className="text-lg font-semibold mb-4">Thesis Compliance Auditor</h2>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">Select Document</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary appearance-none"
                  >
                    <option value="">Choose a document…</option>
                    {documents.map(d => (
                      <option key={d.id} value={d.id}>{d.title || 'Untitled'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">Select Template Rubric</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
                >
                  <option value="">Choose a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { void runComplianceAudit() }}
              disabled={!selectedDocId || !selectedTemplateId || auditing}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 mb-5"
            >
              <ClipboardCheck className="w-4 h-4" />
              {auditing ? 'Auditing…' : 'Run Compliance Audit'}
            </button>

            {auditResult && <ThesisChecklist report={auditResult} />}
          </div>
        )}

        {/* Tab 3: Document Reviews */}
        {activeTab === 'reviews' && (
          <div className="rounded-xl bg-card border border-border p-6">
            <h2 className="text-lg font-semibold mb-2">Document Reviews & Annotations</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Open any student document in the editor to add inline comments, annotations, and grade submissions. Comments appear in the document review sidebar.
            </p>

            <div className="flex flex-col gap-3">
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No documents available for review.</p>
              ) : (
                documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
                    <div>
                      <p className="font-semibold text-sm">{doc.title || 'Untitled Document'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Owner: {doc.user_id.slice(0, 8)}… • Updated {new Date(doc.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Link
                      to={`/document/${doc.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-sm font-medium hover:bg-secondary no-underline text-foreground"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Open & Review
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Classroom Submission Folders */}
        {activeTab === 'folders' && (
          <div className="rounded-xl bg-card border border-border p-6">
            <h2 className="text-lg font-semibold mb-2">Classroom Submission Folders</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Organize student submissions by class or assignment. Students can submit drafts directly to your class folders.
            </p>
            <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
              <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Classroom folders are managed from the main document dashboard.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-primary no-underline hover:underline"
              >
                Go to Document Dashboard →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
