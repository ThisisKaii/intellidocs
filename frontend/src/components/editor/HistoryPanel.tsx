import { useEffect, useState } from 'react'
import { Clock, RotateCcw, History, Diff, Palette } from 'lucide-react'
import { api, type DocumentVersion } from '@/services/api'
import { diffWords } from '@/lib/htmlDiff'
import { readFormatSnapshot } from '@/lib/formatSnapshot'

interface HistoryPanelProps {
  documentId: string | undefined
  currentContent: string
  onRestored: (version: DocumentVersion) => void
}

/** Format a Supabase timestamptz into a short human-readable stamp. */
function formatStamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Undo-lock version history (plan points 22–23): lists autosave snapshots with
 * word counts and a "Show Changes" toggle that renders a green/red word diff
 * against the current document. Restores are validated server-side.
 */
export default function HistoryPanel({
  documentId,
  currentContent,
  onRestored,
}: HistoryPanelProps): JSX.Element {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [diffingId, setDiffingId] = useState<string | null>(null)
  const [diffHtml, setDiffHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    setLoading(true)
    void api.documents
      .versions(documentId)
      .then((list) => {
        if (!cancelled) setVersions(list)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load version history.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documentId])

  async function handleRestore(v: DocumentVersion): Promise<void> {
    if (!documentId) return
    setRestoringId(v.version_id)
    try {
      await api.documents.restoreVersion(documentId, v.version_id)
      onRestored(v)
    } catch {
      setError('Restore failed. Try again.')
    } finally {
      setRestoringId(null)
    }
  }

  function toggleDiff(v: DocumentVersion): void {
    if (diffingId === v.version_id) {
      setDiffingId(null)
      setDiffHtml(null)
      return
    }
    const tokens = diffWords(v.content, currentContent)
    setDiffingId(v.version_id)
    setDiffHtml(
      tokens
        .map((t) => {
          if (t.type === 'add') return `<span class="diff-add">${escapeHtml(t.text)}</span>`
          if (t.type === 'del') return `<span class="diff-del">${escapeHtml(t.text)}</span>`
          return escapeHtml(t.text)
        })
        .join(' ')
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '0.5rem 0.75rem 1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.625rem',
          borderRadius: '0.5rem',
          backgroundColor: 'var(--secondary)',
          fontSize: '0.75rem',
          color: 'var(--muted-foreground)',
          lineHeight: 1.4,
        }}
      >
        <History style={{ width: '14px', height: '14px', flexShrink: 0, color: 'var(--primary)' }} />
        <span>
          Autosave snapshots capture the text plus the document formatting (page setup, headers/footers, formatting history). “Show Changes” compares a snapshot to the current text — additions in green, removals struck through red. Restore rolls back both text and formatting.
        </span>
      </div>

      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--destructive)', margin: 0 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>Loading history…</p>
      ) : versions.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
          No snapshots yet. Versions are captured automatically as you edit.
        </p>
      ) : (
        versions.map((v, idx) => {
          const delta =
            v.word_count != null && idx + 1 < versions.length && versions[idx + 1].word_count != null
              ? v.word_count - (versions[idx + 1].word_count ?? 0)
              : null
          const snapshot = readFormatSnapshot(v.editor_prefs)
          const hasFormatState =
            snapshot.formatting_history.length > 0 ||
            snapshot.formatting_preset != null ||
            snapshot.show_header ||
            snapshot.show_footer ||
            snapshot.header_number_format !== 'none' ||
            snapshot.footer_number_format !== 'none'
          return (
            <div key={v.version_id} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                }}
              >
                <Clock style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    {v.version_number ? `Version ${v.version_number} — ` : ''}
                    {formatStamp(v.created_at)}
                    {delta != null && delta !== 0 && (
                      <span style={{ fontWeight: 500 }}>
                        {' '}
                        {delta > 0
                          ? `(+${delta} words)`
                          : `(${delta} words)`}
                      </span>
                    )}
                    {hasFormatState && (
                      <span
                        title="This snapshot stores the document formatting applied at that time — Restore will roll back to it too."
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          marginLeft: '0.5rem',
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          color: 'var(--primary)',
                          border: '1px solid var(--primary)',
                          borderRadius: '999px',
                          padding: '0 0.375rem',
                          verticalAlign: 'middle',
                        }}
                      >
                        <Palette style={{ width: '9px', height: '9px' }} />
                        {snapshot.formatting_preset ?? 'Format'}
                      </span>
                    )}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.65625rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.content.replace(/<[^>]+>/g, '').slice(0, 60) || '(empty)'}
                    {v.word_count != null && <> · {v.word_count} words</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDiff(v)}
                  style={diffButtonStyle(diffingId === v.version_id)}
                >
                  <Diff style={{ width: '12px', height: '12px' }} />
                  Changes
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestore(v)}
                  disabled={restoringId === v.version_id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw style={{ width: '12px', height: '12px' }} />
                  Restore
                </button>
              </div>
              {diffingId === v.version_id && diffHtml && (
                <div
                  className="history-diff"
                  // Rendered from a sanitized token sequence produced by diffWords.
                  dangerouslySetInnerHTML={{ __html: diffHtml }}
                />
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

/** Style helper for the "Show Changes" toggle button. */
function diffButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--border)',
    backgroundColor: active ? 'var(--secondary)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--foreground)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  }
}

/** Escape HTML so diff text is never re-parsed as markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}