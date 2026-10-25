import { useState } from 'react'
import { GraduationCap, Plus, Users } from 'lucide-react'
import { api, type FolderRecord, type FolderType } from '@/services/api'
import FolderCreateModal from '@/components/drive/FolderCreateModal'
import { ClassRosterModal } from '@/components/drive/ClassRosterModal'
import JoinCodeBadge from '@/components/drive/JoinCodeBadge'
import { EmptyState } from '@/components/EmptyState'
import type { ClassData } from './useProfessorWorkspace'

interface ClassesPanelProps {
  classes: ClassData[]
  /** Reload the workspace after a class or roster changes. */
  onChanged: () => void
}

/** The professor's classes with their join codes, rosters and a way to start a new class. */
export function ClassesPanel({ classes, onChanged }: ClassesPanelProps): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [rosterFor, setRosterFor] = useState<FolderRecord | null>(null)

  /** Create the class, then refresh so it appears with its join code. */
  async function createClass(input: { name: string; folderType: FolderType; classCode?: string; academicTerm?: string }): Promise<void> {
    setSubmitting(true)
    setCreateError('')
    try {
      await api.folders.create(input.name, input)
      setCreating(false)
      onChanged()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create the class')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Share a join code with students, or add them by email from the roster.</p>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> New class
        </button>
      </div>

      {classes.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No classes yet" body="Create a class to get a join code your students can use. Their submissions then show up here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map(({ folder, roster, submissions }) => (
            <article key={folder.folder_id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{folder.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {folder.class_code || 'Class'}{folder.academic_term ? ` · ${folder.academic_term}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setRosterFor(folder)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary">
                  <Users className="size-3.5" /> Roster
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                <span><strong className="tabular-nums text-foreground">{roster.length}</strong> students</span>
                <span><strong className="tabular-nums text-foreground">{submissions.length}</strong> submissions</span>
              </div>
              <div className="mt-3"><JoinCodeBadge folder={folder} onChanged={onChanged} /></div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <FolderCreateModal onClose={() => { setCreating(false); setCreateError('') }} onSubmit={(input) => { void createClass(input) }} submitting={submitting} error={createError} userRole="professor" />
      )}
      {rosterFor && <ClassRosterModal folder={rosterFor} onClose={() => setRosterFor(null)} onChanged={onChanged} />}
    </div>
  )
}
