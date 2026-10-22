import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Scale,
  X,
} from 'lucide-react'
import type { PlagiarismMatchRecord, PlagiarismScanDetail } from '@/services/api'
import type { CouncilMatchVerdict, DeliberationEntry } from './plagiarismTypes'

interface CouncilInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  detail: PlagiarismScanDetail | null
}

/** Severity → visual treatment for match badges and borders. */
const SEVERITY_STYLES: Record<string, { badge: string; border: string; text: string }> = {
  critical: { badge: 'bg-red-500/10 border-red-500/40', border: 'border-l-red-500', text: 'text-red-600' },
  high: { badge: 'bg-orange-500/10 border-orange-500/40', border: 'border-l-orange-500', text: 'text-orange-600' },
  medium: { badge: 'bg-yellow-500/10 border-yellow-500/40', border: 'border-l-yellow-500', text: 'text-yellow-700' },
  low: { badge: 'bg-blue-500/10 border-blue-500/40', border: 'border-l-blue-500', text: 'text-blue-600' },
}

/** Human labels for the match taxonomy. */
const TYPE_LABELS: Record<string, string> = {
  verbatim: 'Verbatim Copy',
  paraphrased: 'Paraphrased',
  uncited_fact: 'Uncited Fact',
  external_source: 'External Source',
  original: 'Original',
}

/** Timeline verdict → badge colours for the forensics panel. */
const FORENSICS_STYLES: Record<string, string> = {
  original_author: 'bg-green-500/10 border-green-500/40 text-green-700',
  derivative_paste: 'bg-red-500/10 border-red-500/40 text-red-600',
  unverified_import: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-700',
  external_source: 'bg-blue-500/10 border-blue-500/40 text-blue-600',
  inconclusive: 'bg-secondary border-border text-muted-foreground',
}

/** Human labels for timeline verdicts. */
const TIMELINE_LABELS: Record<string, string> = {
  original_author: 'Original Author',
  derivative_paste: 'Derivative Paste',
  unverified_import: 'Unverified Import',
  external_source: 'External Source',
  inconclusive: 'Inconclusive',
}

/** Format a duration in seconds as "Xm Ys". */
function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

/** One composition metric tile. */
function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md bg-secondary/40 border border-border/60 px-2 py-1.5">
      <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

/** One summary number in the modal header. */
function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

/** One judge entry in the council transcript. */
function TranscriptEntry({ entry }: { entry: DeliberationEntry }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-foreground">{entry.judge}</span>
        <span className="text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
          {entry.verdict ?? 'inconclusive'}
          {typeof entry.confidence === 'number' ? ` · ${Math.round(entry.confidence * 100)}%` : ''}
        </span>
      </div>
      {entry.reasoning && (
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.reasoning}</p>
      )}
    </div>
  )
}

/** Flagged-vs-source viewer for the active match. */
function MatchViewer({ match }: { match: PlagiarismMatchRecord }): JSX.Element {
  const styles = SEVERITY_STYLES[match.match_severity] ?? SEVERITY_STYLES.medium
  const verdict: CouncilMatchVerdict | null = match.council_verdict

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${styles.badge}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${styles.text}`}>
            {TYPE_LABELS[match.match_type] ?? match.match_type}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            Similarity {Math.round(match.similarity_score)}% · Paragraph #{match.paragraph_index + 1}
          </span>
          <span className={`ml-auto text-[0.6875rem] font-bold uppercase tracking-wide ${styles.text}`}>
            {match.match_severity}
          </span>
        </div>
        {verdict && (
          <p className="text-xs text-muted-foreground mt-2">
            Council verdict: <span className="font-semibold text-foreground">{verdict.final_verdict.replace(/_/g, ' ')}</span>
            {' '}· confidence {Math.round(verdict.overall_confidence * 100)}%
            {!verdict.quorum_reached && ' · quorum not reached'}
          </p>
        )}
      </div>

      <div className={`rounded-lg border border-border ${styles.border} border-l-4 bg-card p-4`}>
        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4 text-orange-500" />
          Flagged text (this submission)
        </div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {match.flagged_text || match.target_excerpt || 'No text recorded for this match.'}
        </p>
      </div>

      <div className="rounded-lg border border-border border-l-4 border-l-border bg-secondary/30 p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-foreground">
          <FileText className="size-4 text-muted-foreground" />
          Source text (matched peer)
        </div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {match.source_excerpt || 'No source excerpt recorded for this match.'}
        </p>
      </div>
    </div>
  )
}

/**
 * Read-only academic integrity inspection for one council scan: flagged
 * passages with their peer sources, the judge transcript, and forensic notes.
 */
export function CouncilInspectionModal({ isOpen, onClose, detail }: CouncilInspectionModalProps): JSX.Element | null {
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0)
  const [tab, setTab] = useState<'transcript' | 'forensics'>('transcript')

  useEffect(() => {
    setActiveMatchIndex(0)
    setTab('transcript')
  }, [detail?.scan.scan_id])

  if (!isOpen || !detail) return null

  const { scan, matches, documentTitle } = detail
  const safeIndex = matches.length > 0 ? Math.min(activeMatchIndex, matches.length - 1) : 0
  const activeMatch: PlagiarismMatchRecord | undefined = matches[safeIndex]
  const activeVerdict = activeMatch?.council_verdict ?? null
  const forensics = activeMatch?.council_verdict?.forensics ?? null
  const timelineVerdict = forensics?.timeline_verdict ?? activeMatch?.timeline_verdict ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-overlay" onClick={onClose} />
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-card text-foreground rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border animate-modal">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shrink-0">
              <Scale className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Academic Integrity Inspection</h2>
              <p className="text-sm text-muted-foreground truncate">{documentTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {scan.active_judges_count} judges
            </span>
            <span
              className={`text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full border ${
                scan.quorum_reached
                  ? 'bg-green-500/10 border-green-500/40 text-green-700'
                  : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-700'
              }`}
            >
              {scan.quorum_reached ? 'Quorum reached' : 'No quorum'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspection"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary border-none bg-transparent cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-border">
          <Stat label="Originality" value={`${Math.round(scan.overall_originality_score)}%`} />
          <Stat label="Peer similarity" value={`${Math.round(scan.peer_similarity_score)}%`} />
          <Stat label="Flagged passages" value={String(matches.length)} />
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-auto p-6">
            {matches.length === 0 || !activeMatch ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Scale className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-base font-medium text-foreground">No flagged passages</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This submission looks original against its peers in the folder.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">
                    Passage {safeIndex + 1} of {matches.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous passage"
                      disabled={safeIndex === 0}
                      onClick={() => setActiveMatchIndex(safeIndex - 1)}
                      className="p-1.5 rounded-md border border-border bg-background text-foreground disabled:opacity-40 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next passage"
                      disabled={safeIndex >= matches.length - 1}
                      onClick={() => setActiveMatchIndex(safeIndex + 1)}
                      className="p-1.5 rounded-md border border-border bg-background text-foreground disabled:opacity-40 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
                <MatchViewer match={activeMatch} />
              </>
            )}
          </main>

          <aside className="w-96 shrink-0 border-l border-border bg-secondary/30 overflow-hidden flex flex-col">
            <div className="flex border-b border-border">
              {(['transcript', 'forensics'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors bg-transparent cursor-pointer ${
                    tab === key
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {key === 'transcript' ? 'Council Transcript' : 'Forensics'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {tab === 'transcript' ? (
                activeVerdict ? (
                  <>
                    {(activeVerdict.deliberation_transcript ?? []).map((entry, index) => (
                      <TranscriptEntry key={`${entry.judge}-${index}`} entry={entry} />
                    ))}
                    {activeVerdict.final_reasoning && (
                      <div className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs font-semibold text-foreground mb-1">Final reasoning</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {activeVerdict.final_reasoning}
                        </p>
                      </div>
                    )}
                    {activeVerdict.recommended_action && (
                      <p className="text-xs text-muted-foreground">
                        Recommended action: <span className="font-medium text-foreground">
                          {activeVerdict.recommended_action.replace(/_/g, ' ')}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No council transcript for this passage.
                  </p>
                )
              ) : timelineVerdict ? (
                <>
                  <div
                    className={`rounded-lg border p-3 ${
                      FORENSICS_STYLES[timelineVerdict] ?? FORENSICS_STYLES.inconclusive
                    }`}
                  >
                    <p className="text-[0.6875rem] uppercase tracking-wide opacity-80">Timeline verdict</p>
                    <p className="text-sm font-semibold">
                      {TIMELINE_LABELS[timelineVerdict] ?? timelineVerdict.replace(/_/g, ' ')}
                    </p>
                    {forensics && (
                      <p className="text-xs opacity-80">
                        Confidence {Math.round(forensics.confidence * 100)}%
                      </p>
                    )}
                  </div>

                  {forensics && forensics.evidence.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-semibold text-foreground mb-1">Evidence</p>
                      <ul className="text-xs leading-relaxed text-muted-foreground list-disc pl-4 space-y-1">
                        {forensics.evidence.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {forensics?.composition && (
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-semibold text-foreground mb-2">Composition metrics</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Metric
                          label="Session"
                          value={formatDuration(forensics.composition.session_duration_seconds)}
                        />
                        <Metric
                          label="Characters"
                          value={String(forensics.composition.total_characters)}
                        />
                        <Metric
                          label="Typing events"
                          value={String(forensics.composition.typing_events)}
                        />
                        <Metric
                          label="Paste events"
                          value={String(forensics.composition.paste_events)}
                        />
                        <Metric
                          label="Typing speed"
                          value={`${forensics.composition.avg_typing_speed_cps.toFixed(1)} cps`}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No forensic timeline data was captured for this match.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
