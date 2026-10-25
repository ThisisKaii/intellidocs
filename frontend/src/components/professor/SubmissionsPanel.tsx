import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { api, type DocumentReview } from '@/services/api'
import { EmptyState } from '@/components/EmptyState'
import { GradeDrawer, type GradeTarget } from './GradeDrawer'
import { FLAGGED_BELOW } from './ProfessorOverview'
import { latestScanByDocument, type ClassData } from './useProfessorWorkspace'

/** One row of the submissions table. */
interface SubmissionRow {
  documentId: string
  title: string
  studentId: string
  studentName: string
  className: string
  updatedAt: string
  originality: number | null
}

/** Most submissions whose grades are fetched for the table in one go. */
const GRADE_LOOKUP_LIMIT = 60

/** Every submission across the professor's classes, with originality and grade, and a drawer to grade it. */
export function SubmissionsPanel({ classes }: { classes: ClassData[] }): JSX.Element {
  const [classFilter, setClassFilter] = useState('all')
  const [reviews, setReviews] = useState<Record<string, DocumentReview>>({})
  const [target, setTarget] = useState<GradeTarget | null>(null)

  const rows = useMemo<SubmissionRow[]>(
    () =>
      classes.flatMap((c) => {
        const names = new Map(c.roster.map((r) => [r.student_id, r.display_name || r.email?.split('@')[0] || 'Student']))
        const scans = latestScanByDocument(c.scans)
        return c.submissions.map((doc) => ({
          documentId: doc.id,
          title: doc.title,
          studentId: doc.user_id,
          studentName: names.get(doc.user_id) ?? 'Student',
          className: c.folder.name,
          updatedAt: doc.updated_at,
          originality: scans.has(doc.id) ? Number(scans.get(doc.id)!.overall_originality_score) : null,
        }))
      }),
    [classes],
  )

  const visible = rows.filter((row) => classFilter === 'all' || row.className === classFilter)

  // Grades live in a separate table, so look them up once per submission.
  useEffect(() => {
    let cancelled = false
    rows.slice(0, GRADE_LOOKUP_LIMIT).forEach((row) => {
      api.professor.getReview(row.documentId).then((review) => {
        if (!cancelled && review) setReviews((current) => ({ ...current, [row.documentId]: review }))
      }).catch(() => undefined)
    })
    return () => { cancelled = true }
  }, [rows])

  if (rows.length === 0) {
    return <EmptyState icon={FileText} title="No submissions yet" body="When students add documents to one of your classes, they show up here for grading." />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="class-filter" className="text-sm text-muted-foreground">Class</label>
        <select id="class-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          <option value="all">All classes</option>
          {classes.map((c) => <option key={c.folder.folder_id} value={c.folder.name}>{c.folder.name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-3">Student</th><th className="p-3">Document</th><th className="p-3">Class</th>
              <th className="p-3">Updated</th><th className="p-3">Originality</th><th className="p-3">Grade</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const review = reviews[row.documentId]
              return (
                <tr key={`${row.className}-${row.documentId}`} className="border-b border-border/50 last:border-0">
                  <td className="p-3 font-medium">{row.studentName}</td>
                  <td className="max-w-[16rem] truncate p-3">{row.title || 'Untitled'}</td>
                  <td className="p-3 text-muted-foreground">{row.className}</td>
                  <td className="p-3 text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td>
                  <td className="p-3 tabular-nums">
                    {row.originality == null ? <span className="text-muted-foreground">Not scanned</span> : (
                      <span className={row.originality < FLAGGED_BELOW ? 'font-semibold text-destructive' : ''}>{Math.round(row.originality)}%</span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">{review?.grade != null ? review.grade : <span className="text-muted-foreground">Ungraded</span>}</td>
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => setTarget({ documentId: row.documentId, studentId: row.studentId, studentName: row.studentName, title: row.title, className: row.className })} className="h-8 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary">
                      Review
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {target && (
        <GradeDrawer
          target={target}
          onClose={() => setTarget(null)}
          onGraded={(documentId, review) => { setReviews((current) => ({ ...current, [documentId]: review })); setTarget(null) }}
        />
      )}
    </div>
  )
}
