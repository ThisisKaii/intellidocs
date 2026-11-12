import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api, type FolderRecord, type StudentClassGrade } from '@/services/api'
import {
  DEFAULT_RUBRIC,
  MAX_CRITERIA,
  RUBRIC_TOTAL_POINTS,
  criterionId,
  rubricPoints,
  rubricProblem,
  type ClassRubric,
  type RubricCriterion,
} from '@/lib/rubric'

interface ClassRubricDialogProps {
  folder: FolderRecord
  onClose: () => void
}

/** Editable copy of a criterion: points stay text while typed. */
interface CriterionDraft extends Omit<RubricCriterion, 'maxPoints'> {
  points: string
}

function toDrafts(rubric: ClassRubric): CriterionDraft[] {
  return rubric.criteria.map(({ maxPoints, ...rest }) => ({ ...rest, points: String(maxPoints) }))
}

function fromDrafts(drafts: CriterionDraft[]): ClassRubric {
  return {
    criteria: drafts.map(({ points, ...rest }) => ({
      ...rest,
      name: rest.name.trim(),
      description: rest.description.trim(),
      maxPoints: Number(points),
    })),
  }
}

/**
 * A class's grading rubric. The class's professor edits it (criteria, what each covers and
 * its points, which add up to 100); a student sees it read-only together with the grades
 * on their own submissions in the class.
 */
export function ClassRubricDialog({ folder, onClose }: ClassRubricDialogProps): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [custom, setCustom] = useState(false)
  const [rubric, setRubric] = useState<ClassRubric>(DEFAULT_RUBRIC)
  const [drafts, setDrafts] = useState<CriterionDraft[]>(toDrafts(DEFAULT_RUBRIC))
  const [grades, setGrades] = useState<StudentClassGrade[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.folders
      .rubric(folder.folder_id)
      .then(async (info) => {
        if (cancelled) return
        setRubric(info.rubric)
        setDrafts(toDrafts(info.rubric))
        setCustom(info.custom)
        setCanEdit(Boolean(info.canEdit))
        if (!info.canEdit) {
          const mine = await api.folders.myGrades(folder.folder_id).catch((): StudentClassGrade[] => [])
          if (!cancelled) setGrades(mine)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the rubric')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [folder.folder_id])

  const edited = useMemo(() => fromDrafts(drafts), [drafts])
  const total = rubricPoints(edited)

  function update(index: number, change: Partial<CriterionDraft>): void {
    setSaved(false)
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...change } : draft)))
  }

  function addCriterion(): void {
    setSaved(false)
    setDrafts((current) => {
      const taken = new Set(current.map((draft) => draft.id))
      const remaining = Math.max(0, RUBRIC_TOTAL_POINTS - rubricPoints(fromDrafts(current)))
      return [...current, { id: criterionId(`criterion ${current.length + 1}`, taken), name: '', description: '', points: remaining ? String(remaining) : '' }]
    })
  }

  function removeCriterion(index: number): void {
    setSaved(false)
    setDrafts((current) => current.filter((_, i) => i !== index))
  }

  /** Save the rubric; new criteria get ids from their names. */
  async function save(): Promise<void> {
    const taken = new Set<string>()
    const named = edited.criteria.map((criterion) => {
      const id = /^criterion-\d+(-\d+)?$/.test(criterion.id) && criterion.name ? criterionId(criterion.name, taken) : criterion.id
      taken.add(id)
      return { ...criterion, id }
    })
    const next = { criteria: named }
    const problem = rubricProblem(next)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      const info = await api.folders.saveRubric(folder.folder_id, next)
      setRubric(info.rubric)
      setDrafts(toDrafts(info.rubric))
      setCustom(true)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the rubric')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl" data-testid="class-rubric-dialog">
        <DialogTitle className="flex items-center gap-2">
          <ClipboardList className="size-5" /> {canEdit ? 'Class rubric' : 'Rubric and grades'}
        </DialogTitle>
        <DialogDescription>
          {canEdit
            ? `How submissions to ${folder.name} are graded. The points of all criteria add up to the grade out of ${RUBRIC_TOTAL_POINTS}. Your students can see this rubric.`
            : `How your professor grades submissions to ${folder.name}${custom ? '' : ' (the default rubric)'}.`}
        </DialogDescription>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : canEdit ? (
          <div className="mt-4 flex flex-col gap-3">
            {drafts.map((draft, index) => (
              <div key={draft.id} className="grid grid-cols-[1fr_88px_36px] items-start gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1.4fr_88px_36px]">
                <input
                  aria-label={`Criterion ${index + 1} name`}
                  placeholder="Criterion"
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => update(index, { name: e.target.value })}
                  className="settings-input h-9 w-full"
                />
                <input
                  aria-label={`Criterion ${index + 1} description`}
                  placeholder="What it covers (optional)"
                  value={draft.description}
                  maxLength={200}
                  onChange={(e) => update(index, { description: e.target.value })}
                  className="settings-input col-span-3 row-start-2 h-9 w-full sm:col-span-1 sm:row-start-auto"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    aria-label={`Criterion ${index + 1} points`}
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={draft.points}
                    onChange={(e) => update(index, { points: e.target.value })}
                    className="settings-input h-9 w-16"
                  />
                  pts
                </label>
                <button
                  type="button"
                  onClick={() => removeCriterion(index)}
                  disabled={drafts.length <= 1}
                  aria-label={`Remove criterion ${index + 1}`}
                  title="Remove criterion"
                  className="inline-flex size-9 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addCriterion} disabled={drafts.length >= MAX_CRITERIA}>
                <Plus className="mr-1 size-4" /> Add criterion
              </Button>
              <span className={`text-sm font-medium tabular-nums ${total === RUBRIC_TOTAL_POINTS ? 'text-muted-foreground' : 'text-destructive'}`} data-testid="rubric-total">
                Total {total} / {RUBRIC_TOTAL_POINTS}
              </span>
            </div>
            {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
            {saved && !error && <p className="m-0 text-sm text-muted-foreground">Saved. New grades use this rubric; grades already given keep theirs.</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
              <Button type="button" onClick={() => { void save() }} disabled={saving}>
                {saving && <Loader2 className="mr-1 size-4 animate-spin" />} Save rubric
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            <table className="w-full border-collapse text-sm" aria-label="Rubric">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Criterion</th>
                  <th className="pb-2 font-medium">What it covers</th>
                  <th className="pb-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {rubric.criteria.map((criterion) => (
                  <tr key={criterion.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{criterion.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{criterion.description || '—'}</td>
                    <td className="py-2 text-right tabular-nums">{criterion.maxPoints}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold">
                  <td className="py-2" colSpan={2}>Total</td>
                  <td className="py-2 text-right tabular-nums">{rubricPoints(rubric)}</td>
                </tr>
              </tbody>
            </table>

            <section aria-label="Your grades" className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-semibold">Your grades</h3>
              {grades.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">You have not handed anything in to this class yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {grades.map((item) => (
                    <li key={item.document_id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2">
                      <Link to={`/document/${item.document_id}`} className="min-w-0 truncate text-sm font-medium text-foreground no-underline hover:underline" onClick={onClose}>
                        {item.title || 'Untitled'}
                      </Link>
                      {item.grade !== null ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums" data-testid="class-grade">
                          {Number(item.grade)}<span className="font-normal text-muted-foreground">/100</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">Not graded yet</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 text-xs text-muted-foreground">Open a submission to see its rubric scores, notes and comments in the Feedback tab.</p>
            </section>
            {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
