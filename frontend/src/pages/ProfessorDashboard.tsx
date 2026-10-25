import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ProfessorOverview } from '@/components/professor/ProfessorOverview'
import { ClassesPanel } from '@/components/professor/ClassesPanel'
import { SubmissionsPanel } from '@/components/professor/SubmissionsPanel'
import { PlagiarismPanel } from '@/components/professor/PlagiarismPanel'
import { CompliancePanel } from '@/components/professor/CompliancePanel'
import { useProfessorWorkspace } from '@/components/professor/useProfessorWorkspace'

type TabKey = 'overview' | 'classes' | 'submissions' | 'plagiarism' | 'compliance'

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'classes', label: 'Classes', icon: GraduationCap },
  { key: 'submissions', label: 'Submissions', icon: FileText },
  { key: 'plagiarism', label: 'Plagiarism', icon: ShieldCheck },
  { key: 'compliance', label: 'Compliance', icon: ClipboardCheck },
]

/** Professor workspace: classes, submissions, grading, plagiarism scans and compliance audits. */
export default function ProfessorDashboard(): JSX.Element {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'overview'
  const { classes, loading, error, reload } = useProfessorWorkspace(user?.id)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" aria-label="Back to dashboard" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground no-underline hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <GraduationCap className="size-5 text-primary" />
          <span className="text-sm font-bold">Professor workspace</span>
        </div>
        <button type="button" onClick={() => { void reload() }} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
        </button>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 lg:flex-row">
        <nav aria-label="Professor sections" className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => setParams(key === 'overview' ? {} : { tab: key })}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <h1 className="mb-4 text-xl font-semibold">{TABS.find((t) => t.key === tab)?.label}</h1>
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}
          {loading && classes.length === 0 ? (
            <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {tab === 'overview' && <ProfessorOverview classes={classes} />}
              {tab === 'classes' && <ClassesPanel classes={classes} onChanged={() => { void reload() }} />}
              {tab === 'submissions' && <SubmissionsPanel classes={classes} />}
              {tab === 'plagiarism' && <PlagiarismPanel classes={classes} onScanned={() => { void reload() }} />}
              {tab === 'compliance' && <CompliancePanel classes={classes} userId={user?.id ?? 'anonymous'} />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
