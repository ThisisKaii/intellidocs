import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ClipboardCheck, Globe2, Loader2, RefreshCw, Square, Users, X } from 'lucide-react'
import { api, type GlobalScopeFilters, type PlagiarismScanDetail, type PlagiarismScope } from '@/services/api'
import { SimilarityMatrix } from '@/components/editor/SimilarityMatrix'
import { CouncilInspectionModal } from '@/components/editor/CouncilInspectionModal'
import { EmptyState } from '@/components/EmptyState'
import type { ClassData } from './useProfessorWorkspace'

interface ScanProgress {
  done: number
  total: number
  title: string
}

interface BatchScanState {
  folderId: string
  scope: PlagiarismScope
  scanning: boolean
  progress: ScanProgress | null
  refreshKey: number
  notice: { tone: 'ok' | 'error'; text: string } | null
  finished: { text: string; report: PlagiarismScanDetail | null } | null
}

let batchState: BatchScanState = {
  folderId: '',
  scope: 'local',
  scanning: false,
  progress: null,
  refreshKey: 0,
  notice: null,
  finished: null,
}
let cancelBatchRequested = false
let latestOnScanned: (() => void) | null = null
const batchListeners = new Set<() => void>()

function updateBatchState(patch: Partial<BatchScanState>): void {
  batchState = { ...batchState, ...patch }
  for (const listener of batchListeners) listener()
}

function subscribeBatch(listener: () => void): () => void {
  batchListeners.add(listener)
  return () => {
    batchListeners.delete(listener)
  }
}

function getBatchSnapshot(): BatchScanState {
  return batchState
}

/** How often a running scan is checked, and how long one is waited for before moving on. */
const SCAN_POLL_MS = 3000
const SCAN_WAIT_MS = 180_000

/**
 * A started scan, once the council has finished it (or failed). Null when it is still running
 * after SCAN_WAIT_MS: it carries on on the server, and the professor is notified when it is done.
 */
async function waitForScan(scanId: string): Promise<PlagiarismScanDetail | null> {
  const started = Date.now()
  while (Date.now() - started < SCAN_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_MS))
    const detail = await api.plagiarism.getScan(scanId)
    if (detail.scan.scan_status !== 'running') return detail
  }
  return null
}

/** Distinct non-empty values, sorted newest-looking first (terms like "2026-T1" sort by year). */
function distinct(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))).sort().reverse()
}

/** Local/global toggle, scan runner and similarity matrix for the professor's classes. */
export function PlagiarismPanel({ classes, onScanned }: { classes: ClassData[]; onScanned: () => void }): JSX.Element {
  const { folderId, scope, scanning, progress, refreshKey, notice, finished } = useSyncExternalStore(
    subscribeBatch,
    getBatchSnapshot,
    getBatchSnapshot,
  )
  const [detail, setDetail] = useState<PlagiarismScanDetail | null>(null)
  const [term, setTerm] = useState('')
  const [classCode, setClassCode] = useState('')
  const [includePast, setIncludePast] = useState(true)

  useEffect(() => {
    latestOnScanned = onScanned
    return () => {
      if (latestOnScanned === onScanned) latestOnScanned = null
    }
  }, [onScanned])

  const classNames = useMemo(() => Object.fromEntries(classes.map((c) => [c.folder.folder_id, c.folder.name])), [classes])
  const selected = classes.find((c) => c.folder.folder_id === folderId) ?? classes[0]
  const activeFolderId = selected?.folder.folder_id ?? ''
  const terms = useMemo(() => distinct(classes.map((c) => c.folder.academic_term)), [classes])
  const classCodes = useMemo(() => distinct(classes.map((c) => c.folder.class_code)), [classes])
  const filters: GlobalScopeFilters | undefined = scope === 'global'
    ? { academicTerms: term ? [term] : [], classCodes: classCode ? [classCode] : [], includePastTerms: includePast }
    : undefined

  /** Scan every submission in the selected class in the chosen scope; Stop ends it after the current document. */
  async function runScans(): Promise<void> {
    if (!selected || batchState.scanning) return
    const docs = selected.submissions
    if (docs.length === 0) {
      updateBatchState({ notice: { tone: 'error', text: 'This class has no submissions to scan yet.' } })
      return
    }
    const runScope = batchState.scope
    const runFolderId = activeFolderId
    cancelBatchRequested = false
    updateBatchState({ folderId: runFolderId, scanning: true, notice: null, finished: null })
    let done = 0
    let failed = 0
    let stillRunning = 0
    let report: PlagiarismScanDetail | null = null
    const refused: string[] = []
    try {
      // One scan at a time: each answers at once and the council works on the server, so the page
      // stays usable (and switching dashboard tabs preserves progress).
      for (const doc of docs) {
        if (cancelBatchRequested) break
        updateBatchState({ progress: { done, total: docs.length, title: doc.title || 'Untitled' } })
        let started: PlagiarismScanDetail
        try {
          started = await api.plagiarism.runScan(runFolderId, doc.id, runScope, filters)
        } catch (err) {
          // A submission the server refuses (too short to scan) is skipped, not the whole batch.
          refused.push(`${doc.title || 'Untitled'}: ${err instanceof Error ? err.message : 'could not be scanned'}`)
          done += 1
          continue
        }
        const result = started.scan.scan_status === 'running' ? await waitForScan(started.scan.scan_id) : started
        if (!result) stillRunning += 1
        else if (result.scan.scan_status === 'failed') failed += 1
        else report = result
        done += 1
      }
      const parts = [`${cancelBatchRequested ? 'Stopped after' : 'Scanned'} ${done} of ${docs.length} submissions (${runScope === 'global' ? 'all your classes' : 'this class'}).`]
      if (failed > 0) parts.push(`${failed} could not finish; run them again.`)
      if (stillRunning > 0) parts.push(`${stillRunning} still running; you will be notified when done.`)
      if (refused.length > 0) parts.push(`Not scanned: ${refused.join('; ')}`)
      updateBatchState({
        finished: { text: parts.join(' '), report },
        refreshKey: batchState.refreshKey + 1,
      })
      latestOnScanned?.()
    } catch (err) {
      updateBatchState({ notice: { tone: 'error', text: err instanceof Error ? err.message : 'Scan failed' } })
    } finally {
      updateBatchState({ progress: null, scanning: false })
    }
  }

  /** Open the latest scan of the clicked student in the inspection dialog. */
  async function inspect(studentId: string): Promise<void> {
    try {
      const scans = await api.plagiarism.listFolderScans(activeFolderId)
      const scan = scans.find((entry) => entry.user_id === studentId)
      if (!scan) {
        updateBatchState({ notice: { tone: 'error', text: 'No scan recorded for this student yet. Run a scan first.' } })
        return
      }
      setDetail(await api.plagiarism.getScan(scan.scan_id))
    } catch (err) {
      updateBatchState({ notice: { tone: 'error', text: err instanceof Error ? err.message : 'Failed to load the scan' } })
    }
  }

  if (classes.length === 0) {
    return <EmptyState icon={ClipboardCheck} title="Create a class first" body="Plagiarism scans compare the submissions in your classes with each other." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Class" value={activeFolderId} onChange={(e) => updateBatchState({ folderId: e.target.value })} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          {classes.map((c) => <option key={c.folder.folder_id} value={c.folder.folder_id}>{c.folder.name}</option>)}
        </select>

        <div role="group" aria-label="Scope" className="inline-flex rounded-md border border-border p-0.5">
          {([['local', 'This class', Users], ['global', 'All my classes', Globe2]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" aria-pressed={scope === key} onClick={() => updateBatchState({ scope: key })} className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium ${scope === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {scanning ? (
            <button type="button" onClick={() => { cancelBatchRequested = true }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary">
              <Square className="size-3.5" /> Stop
            </button>
          ) : (
            <button type="button" onClick={() => { void runScans() }} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <ClipboardCheck className="size-4" /> Scan submissions
            </button>
          )}
          <button type="button" onClick={() => updateBatchState({ refreshKey: batchState.refreshKey + 1 })} aria-label="Refresh matrix" className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-secondary">
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {scope === 'global' && (
        <div role="group" aria-label="Global filters" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Term</span>
            <select aria-label="Academic term" value={term} onChange={(e) => setTerm(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All terms</option>
              {terms.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Class code</span>
            <select aria-label="Class code" value={classCode} onChange={(e) => setClassCode(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All classes</option>
              {classCodes.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" aria-label="Include past terms" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} className="size-4" />
            <span>Include past terms</span>
          </label>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {scope === 'global'
          ? 'Global: each submission is also compared with submissions in your other classes, and the matrix shows which class a match came from.'
          : 'Local: submissions are compared only with others in this class.'}
      </p>

      {progress && (
        <div aria-live="polite">
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Loader2 className="size-3.5 animate-spin" /> Originality scan in progress… you can keep working
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Scanning {progress.done + 1} of {progress.total}: {progress.title}</p>
        </div>
      )}
      {notice && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${notice.tone === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-700' : 'border-red-500/30 bg-red-500/10 text-red-700'}`}>{notice.text}</p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <SimilarityMatrix key={`${activeFolderId}:${scope}:${refreshKey}`} classFolderId={activeFolderId} scope={scope} filters={filters} onStudentSelect={(id) => { void inspect(id) }} />
      </div>

      <CouncilInspectionModal isOpen={detail !== null} onClose={() => setDetail(null)} detail={detail} classNames={classNames} />

      {finished && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Originality scan complete</p>
            <p className="mt-0.5 text-muted-foreground">{finished.text}</p>
            {finished.report && (
              <button
                type="button"
                onClick={() => {
                  setDetail(finished.report)
                  updateBatchState({ finished: null })
                }}
                className="mt-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                View Council Report
              </button>
            )}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => updateBatchState({ finished: null })} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
