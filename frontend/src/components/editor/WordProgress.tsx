import { useEffect, useState, type FormEvent } from 'react'
import { BarChart3, Watch, BookOpen } from 'lucide-react'

interface WordProgressProps {
  wordCount: number
  /** Optional document ID used to persist a custom per-document word goal. */
  documentId?: string
  /** Optional explicit word target; when omitted, scales dynamically with wordCount. */
  targetWords?: number
  /** Estimated words per page for the current page size/spacing. */
  wordsPerPage?: number
}

/** Standard words-per-page for a double-spaced academic page. */
const DEFAULT_WORDS_PER_PAGE = 275

/** Average reading speed in words per minute. */
const WORDS_PER_MINUTE = 200

const WORD_MILESTONES = [500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000]
const STORAGE_PREFIX = 'intellidocs:word-target:'

/**
 * Pick an adaptive milestone target based on the document's current word count
 * so short notes don't sit permanently under a fixed 3,000-word bar and long
 * manuscripts keep scaling past 3,000 words.
 */
export function resolveDynamicWordTarget(wordCount: number): number {
  const normalized = Math.max(0, Math.floor(wordCount))
  const next = WORD_MILESTONES.find((milestone) => milestone >= normalized)
  if (next !== undefined) return next
  return Math.ceil(normalized / 25000) * 25000
}

function readStoredWordTarget(documentId?: string): number | null {
  if (!documentId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${documentId}`)
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeStoredWordTarget(documentId: string | undefined, value: number | null): void {
  if (!documentId || typeof window === 'undefined') return
  try {
    const key = `${STORAGE_PREFIX}${documentId}`
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, String(value))
    }
  } catch {
    // Storage may be unavailable in private browsing or constrained environments.
  }
}

/**
 * Academic word & page target progress tracker (plan point 25). A subtle status
 * bar at the bottom of the editor showing word count, estimated page count,
 * reading time, and a dynamic (or user-customized) progress bar.
 */
export default function WordProgress({
  wordCount,
  documentId,
  targetWords,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
}: WordProgressProps): JSX.Element {
  const [customTarget, setCustomTarget] = useState<number | null>(() => readStoredWordTarget(documentId))
  const [editingTarget, setEditingTarget] = useState(false)
  const [draftTarget, setDraftTarget] = useState('')

  useEffect(() => {
    setCustomTarget(readStoredWordTarget(documentId))
    setEditingTarget(false)
  }, [documentId])

  const effectiveTarget =
    customTarget !== null
      ? customTarget
      : targetWords !== undefined && targetWords > 0
        ? targetWords
        : resolveDynamicWordTarget(wordCount)

  const pages = Math.max(1, Math.ceil(wordCount / wordsPerPage))
  const readingMinutes = Math.round(wordCount / WORDS_PER_MINUTE)
  const readingTime = readingMinutes < 1 ? '<1 min' : `${readingMinutes} min`
  const percent = Math.min(100, Math.round((wordCount / Math.max(1, effectiveTarget)) * 100))

  const startEditing = (): void => {
    setDraftTarget(String(effectiveTarget))
    setEditingTarget(true)
  }

  const handleSaveTarget = (event: FormEvent): void => {
    event.preventDefault()
    const parsed = Number.parseInt(draftTarget.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(1_000_000, Math.max(50, parsed))
      setCustomTarget(clamped)
      writeStoredWordTarget(documentId, clamped)
    }
    setEditingTarget(false)
  }

  const handleResetAuto = (): void => {
    setCustomTarget(null)
    writeStoredWordTarget(documentId, null)
    setEditingTarget(false)
  }

  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        padding: '0.5rem 1rem',
        borderTop: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        fontSize: '0.71875rem',
        color: 'var(--muted-foreground)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
        <BookOpen style={{ width: '13px', height: '13px', color: 'var(--primary)' }} />
        <strong style={{ fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
          {wordCount.toLocaleString()}
        </strong>{' '}
        words
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
        <BarChart3 style={{ width: '13px', height: '13px', color: 'var(--primary)' }} />
        ~{pages} {pages === 1 ? 'page' : 'pages'}
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
        <Watch style={{ width: '13px', height: '13px', color: 'var(--primary)' }} />
        {readingTime} read
      </span>

      <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div
          style={{
            flex: 1,
            height: '6px',
            borderRadius: '999px',
            backgroundColor: 'var(--secondary)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              borderRadius: '999px',
              backgroundColor: percent >= 100 ? 'var(--success)' : 'var(--primary)',
              transition: 'width 220ms ease',
            }}
          />
        </div>
        {editingTarget ? (
          <form
            onSubmit={handleSaveTarget}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
          >
            <input
              type="number"
              min={50}
              max={1000000}
              step={50}
              aria-label="Custom word goal"
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingTarget(false)
              }}
              autoFocus
              style={{
                width: '68px',
                height: '20px',
                padding: '0 4px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '1px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Set
            </button>
            <button
              type="button"
              onClick={handleResetAuto}
              style={{
                padding: '1px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Auto
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title={
              customTarget !== null
                ? 'Custom word goal — click to edit or reset to Auto'
                : 'Dynamic word target — click to set a custom goal'
            }
            style={{
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
              fontSize: 'inherit',
              cursor: 'pointer',
            }}
          >
            {wordCount.toLocaleString()} / {effectiveTarget.toLocaleString()} words
            {customTarget !== null ? ' (goal)' : ''} · {percent}%
          </button>
        )}
      </div>
    </div>
  )
}