import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { api, type LearningSummary } from '@/services/api'

const TYPE_LABELS: Record<string, string> = {
  format_prompt: 'Suggestion popups',
  suggestion_panel: 'Suggestion panel',
  chat_preview: 'Chat previews',
}

/** Tools card: how often the user accepts what IntelliDocs suggests, overall, by kind and by week. */
export default function LearningCard(): JSX.Element {
  const [summary, setSummary] = useState<LearningSummary | null>(null)
  const [error, setError] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    api.ai
      .learningStats()
      .then((result) => {
        if (!cancelled) setSummary(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const peak = Math.max(1, ...(summary?.weekly.map((week) => week.total) ?? [1]))

  return (
    <div style={{ borderRadius: '0.5rem', border: '1px solid var(--border)', padding: '0.75rem' }}>
      <p style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
        <TrendingUp style={{ width: 12, height: 12 }} />
        How well suggestions fit you
      </p>
      {error ? (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Couldn’t load your progress right now.</p>
      ) : !summary ? (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Loading…</p>
      ) : summary.overall.total === 0 ? (
        <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
          Accept or dismiss a few suggestions and your progress will show up here.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {summary.overall.acceptRate}%
            <span style={{ marginLeft: '0.375rem', fontSize: '0.75rem', fontWeight: 400, color: 'var(--muted-foreground)' }}>
              accepted · {summary.overall.accepted} of {summary.overall.total}
            </span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.75rem' }}>
            {Object.entries(summary.byType).map(([type, bucket]) => (
              <div key={type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--foreground)' }}>
                  <span>{TYPE_LABELS[type] ?? type}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>{bucket.acceptRate}% · {bucket.total}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, backgroundColor: 'var(--secondary)', overflow: 'hidden' }}>
                  <div style={{ width: `${bucket.acceptRate ?? 0}%`, height: '100%', backgroundColor: 'var(--primary)' }} />
                </div>
              </div>
            ))}
          </div>
          {summary.weekly.length > 1 ? (
            <div>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>Accept rate by week</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', height: 40 }}>
                {summary.weekly.map((week) => (
                  <div
                    key={week.weekStart}
                    title={`Week of ${week.weekStart}: ${week.acceptRate}% of ${week.total}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(8, ((week.acceptRate ?? 0) / 100) * 100)}%`,
                      borderRadius: 3,
                      backgroundColor: 'var(--primary)',
                      opacity: 0.35 + 0.65 * (week.total / peak),
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
