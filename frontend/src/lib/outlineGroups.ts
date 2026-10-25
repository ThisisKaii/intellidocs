/** One outline row, standing for every heading with the same level and text. */
export interface OutlineGroup<T extends { text: string; level: number }> {
  /** The first heading of the group; the row is drawn from it. */
  entry: T
  /** How many headings the row stands for. */
  count: number
}

/**
 * Collapse headings that repeat (an annex title printed on every page) into one
 * row with a count. The document keeps every heading; only the outline groups.
 */
export function groupRepeatedHeadings<T extends { text: string; level: number }>(entries: T[]): Array<OutlineGroup<T>> {
  const groups = new Map<string, OutlineGroup<T>>()
  for (const entry of entries) {
    const key = `${entry.level}|${entry.text.trim().toLowerCase()}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { entry, count: 1 })
  }
  return Array.from(groups.values())
}

/** The occurrence a click should jump to: 0-based, wrapping around the group. */
export function nextOccurrence(previous: number | undefined, count: number): number {
  return previous === undefined ? 0 : (previous + 1) % Math.max(1, count)
}
