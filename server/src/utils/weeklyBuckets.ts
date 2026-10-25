/** Start of the week (Monday 00:00 UTC) containing the given date, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const offset = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - offset)
  return start.toISOString().slice(0, 10)
}

/**
 * Count timestamps per week for the last `weeks` weeks (oldest first, empty
 * weeks included so a chart has no gaps). Timestamps outside the window or
 * that fail to parse are ignored.
 */
export function bucketByWeek(timestamps: string[], weeks: number, now: Date = new Date()): Array<{ week: string; count: number }> {
  const buckets = new Map<string, number>()
  const current = new Date(`${weekStart(now)}T00:00:00Z`)
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const day = new Date(current)
    day.setUTCDate(day.getUTCDate() - i * 7)
    buckets.set(day.toISOString().slice(0, 10), 0)
  }
  for (const stamp of timestamps) {
    const parsed = new Date(stamp)
    if (Number.isNaN(parsed.getTime())) continue
    const key = weekStart(parsed)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets, ([week, count]) => ({ week, count }))
}
