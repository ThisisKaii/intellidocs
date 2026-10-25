import { useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Globe2, RefreshCw, Square, Users } from 'lucide-react'
import { api, type PlagiarismScanDetail, type PlagiarismScope } from '@/services/api'
import { SimilarityMatrix } from '@/components/editor/SimilarityMatrix'
import { CouncilInspectionModal } from '@/components/editor/CouncilInspectionModal'
import { EmptyState } from '@/components/EmptyState'
import type { ClassData } from './useProfessorWorkspace'

interface ScanProgress {
  done: number
  total: number
  title: string
}

/** Local/global toggle, scan runner and similarity matrix for the professor's classes. */
export function PlagiarismPanel({ classes, onScanned }: { classes: ClassData[]; onScanned: () => void }): JSX.Element {
  const [folderId, setFolderId] = useState(classes[0]?.folder.folder_id ?? '')
  const [scope, setScope] = useState<PlagiarismScope>('local')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [detail, setDetail] = useState<PlagiarismScanDetail | null>(null)
  const cancelRef = useRef(false)

  const classNames = useMemo(() => Object.fromEntries(classes.map((c) => [c.folder.folder_id, c.folder.name])), [classes])
  const selected = classes.find((c) => c.folder.folder_id === folderId) ?? classes[0]
  const activeFolderId = selected?.folder.folder_id ?? ''

  /** Scan every submission in the selected class in the chosen scope; Stop ends it after the current document. */
  async function runScans(): Promise<void> {
    if (!selected || scanning) return
    const docs = selected.submissions
    if (docs.length === 0) {
      setNotice({ tone: 'error', text: 'This class has no submissions to scan yet.' })
      return
    }
    cancelRef.current = false
    setScanning(true)
    setNotice(null)
    let done = 0
    try {
      for (const doc of docs) {
        if (cancelRef.current) break
        setProgress({ done, total: docs.length, title: doc.title || 'Untitled' })
        await api.plagiarism.runScan(activeFolderId, doc.id, scope)
        done += 1
      }
      setNotice({ tone: 'ok', text: `${cancelRef.current ? 'Stopped after' : 'Scanned'} ${done} of ${docs.length} submissions (${scope === 'global' ? 'all your classes' : 'this class'}).` })
      setRefreshKey((key) => key + 1)
      onScanned()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Scan failed' })
    } finally {
      setProgress(null)
      setScanning(false)
    }
  }

  /** Open the latest scan of the clicked student in the inspection dialog. */
  async function inspect(studentId: string): Promise<void> {
    try {
      const scans = await api.plagiarism.listFolderScans(activeFolderId)
      const scan = scans.find((entry) => entry.user_id === studentId)
      if (!scan) {
        setNotice({ tone: 'error', text: 'No scan recorded for this student yet. Run a scan first.' })
        return
      }
      setDetail(await api.plagiarism.getScan(scan.scan_id))
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load the scan' })
    }
  }

  if (classes.length === 0) {
    return <EmptyState icon={ClipboardCheck} title="Create a class first" body="Plagiarism scans compare the submissions in your classes with each other." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Class" value={activeFolderId} onChange={(e) => setFolderId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          {classes.map((c) => <option key={c.folder.folder_id} value={c.folder.folder_id}>{c.folder.name}</option>)}
        </select>

        <div role="group" aria-label="Scope" className="inline-flex rounded-md border border-border p-0.5">
          {([['local', 'This class', Users], ['global', 'All my classes', Globe2]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)} className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium ${scope === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {scanning ? (
            <button type="button" onClick={() => { cancelRef.current = true }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary">
              <Square className="size-3.5" /> Stop
            </button>
          ) : (
            <button type="button" onClick={() => { void runScans() }} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <ClipboardCheck className="size-4" /> Scan submissions
            </button>
          )}
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} aria-label="Refresh matrix" className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-secondary">
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {scope === 'global'
          ? 'Global: each submission is also compared with submissions in your other classes, and the matrix shows which class a match came from.'
          : 'Local: submissions are compared only with others in this class.'}
      </p>

      {progress && (
        <div aria-live="polite">
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
        <SimilarityMatrix key={`${activeFolderId}:${scope}:${refreshKey}`} classFolderId={activeFolderId} scope={scope} onStudentSelect={(id) => { void inspect(id) }} />
      </div>

      <CouncilInspectionModal isOpen={detail !== null} onClose={() => setDetail(null)} detail={detail} classNames={classNames} />
    </div>
  )
}
