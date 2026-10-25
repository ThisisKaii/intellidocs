import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, FileText, GraduationCap, ShieldCheck, Users } from 'lucide-react'
import { CHART_COLORS } from '@/lib/chartColors'
import { StatCard } from './StatCard'
import { latestScanByDocument, type ClassData } from './useProfessorWorkspace'

/** Scans below this originality percentage count as flagged. */
export const FLAGGED_BELOW = 70

/** Originality score ranges shown in the distribution chart. */
const BUCKETS: Array<{ label: string; min: number; max: number; color: string }> = [
  { label: '0-39', min: 0, max: 40, color: CHART_COLORS.red },
  { label: '40-69', min: 40, max: 70, color: CHART_COLORS.amber },
  { label: '70-89', min: 70, max: 90, color: CHART_COLORS.primary },
  { label: '90-100', min: 90, max: 101, color: CHART_COLORS.green },
]

/** Headline numbers and two charts: submissions per class and the originality spread. */
export function ProfessorOverview({ classes }: { classes: ClassData[] }): JSX.Element {
  const students = new Set(classes.flatMap((c) => c.roster.map((r) => r.student_id))).size
  const submissions = classes.reduce((sum, c) => sum + c.submissions.length, 0)
  const latest = classes.flatMap((c) => Array.from(latestScanByDocument(c.scans).values()))
  const flagged = latest.filter((scan) => Number(scan.overall_originality_score) < FLAGGED_BELOW).length

  const perClass = classes.map((c) => ({ name: c.folder.name, submissions: c.submissions.length, students: c.roster.length }))
  const spread = BUCKETS.map((bucket) => ({
    ...bucket,
    count: latest.filter((scan) => {
      const score = Number(scan.overall_originality_score)
      return score >= bucket.min && score < bucket.max
    }).length,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Classes" value={classes.length} icon={GraduationCap} />
        <StatCard label="Students" value={students} icon={Users} />
        <StatCard label="Submissions" value={submissions} icon={FileText} />
        <StatCard label="Scanned" value={latest.length} hint={submissions ? `${Math.round((latest.length / submissions) * 100)}% of submissions` : undefined} icon={ShieldCheck} />
        <StatCard label="Flagged" value={flagged} hint={`originality under ${FLAGGED_BELOW}%`} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Submissions per class</h3>
          {perClass.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Create a class to see activity here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perClass}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="submissions" name="Submissions" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="students" name="Students" fill={CHART_COLORS.slate} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Originality of scanned submissions</h3>
          {latest.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Run a scan from the Plagiarism tab to see scores.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={spread}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Submissions" radius={[4, 4, 0, 0]}>
                  {spread.map((bucket) => <Cell key={bucket.label} fill={bucket.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  )
}
