export interface FeedbackRow {
  prediction_type: string
  accepted: boolean
  created_at: string
}

export interface LearningBucket {
  total: number
  accepted: number
  /** Share of suggestions accepted, 0-100, or null when there is nothing yet. */
  acceptRate: number | null
}

export interface LearningSummary {
  overall: LearningBucket
  /** Accept rate for each kind of suggestion shown to the user. */
  byType: Record<string, LearningBucket>
  /** Oldest to newest, one entry per calendar week that had feedback. */
  weekly: Array<LearningBucket & { weekStart: string }>
}

/** Build a bucket from counts. */
function bucket(total: number, accepted: number): LearningBucket {
  return { total, accepted, acceptRate: total === 0 ? null : Math.round((accepted / total) * 100) }
}

/** Monday (UTC) of the week a timestamp falls in, as YYYY-MM-DD. */
export function weekStartOf(timestamp: string): string {
  const date = new Date(timestamp)
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day)
  return date.toISOString().slice(0, 10)
}

/**
 * Summarize how often a user accepts the system's suggestions: overall, by kind
 * of suggestion, and week by week (the last `weeks` weeks with any feedback).
 */
export function summarizeLearning(rows: FeedbackRow[], weeks: number = 8): LearningSummary {
  const typeCounts = new Map<string, { total: number; accepted: number }>()
  const weekCounts = new Map<string, { total: number; accepted: number }>()
  let accepted = 0

  for (const row of rows) {
    if (row.accepted) accepted += 1
    const type = typeCounts.get(row.prediction_type) ?? { total: 0, accepted: 0 }
    type.total += 1
    if (row.accepted) type.accepted += 1
    typeCounts.set(row.prediction_type, type)

    const week = weekStartOf(row.created_at)
    const entry = weekCounts.get(week) ?? { total: 0, accepted: 0 }
    entry.total += 1
    if (row.accepted) entry.accepted += 1
    weekCounts.set(week, entry)
  }

  const byType: Record<string, LearningBucket> = {}
  for (const [type, counts] of typeCounts) byType[type] = bucket(counts.total, counts.accepted)

  const weekly = Array.from(weekCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([weekStart, counts]) => ({ weekStart, ...bucket(counts.total, counts.accepted) }))

  return { overall: bucket(rows.length, accepted), byType, weekly }
}
