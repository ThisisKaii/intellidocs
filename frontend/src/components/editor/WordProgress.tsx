import { BarChart3, Watch, BookOpen } from 'lucide-react'

interface WordProgressProps {
  wordCount: number
  /** Chapter target in words; defaults to a UCLM-style chapter length. */
  targetWords?: number
  /** Estimated words per page for the current page size/spacing. */
  wordsPerPage?: number
}

/** Standard words-per-page for a double-spaced academic page. */
const DEFAULT_WORDS_PER_PAGE = 275

/** Average reading speed in words per minute. */
const WORDS_PER_MINUTE = 200

/**
 * Academic word & page target progress tracker (plan point 25). A subtle status
 * bar at the bottom of the editor showing word count, estimated page count,
 * reading time, and a progress bar against the chapter target.
 */
export default function WordProgress({
  wordCount,
  targetWords = 3000,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
}: WordProgressProps): JSX.Element {
  const pages = Math.max(1, Math.ceil(wordCount / wordsPerPage))
  const readingMinutes = Math.round(wordCount / WORDS_PER_MINUTE)
  const readingTime = readingMinutes < 1 ? '<1 min' : `${readingMinutes} min`
  const percent = Math.min(100, Math.round((wordCount / targetWords) * 100))

  return (
    <div
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
        <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {wordCount.toLocaleString()} / {targetWords.toLocaleString()} words · {percent}%
        </span>
      </div>
    </div>
  )
}