/**
 * Pick a document title that does not collide with the titles already in use,
 * Google Drive style: "Report", then "Report (1)", "Report (2)", ...
 * Comparison ignores case and surrounding whitespace.
 */
export function nextUniqueTitle(base: string, takenTitles: string[]): string {
  const clean = base.trim()
  const taken = new Set(takenTitles.map((title) => title.trim().toLowerCase()))
  if (!taken.has(clean.toLowerCase())) return clean
  let n = 1
  while (taken.has(`${clean} (${n})`.toLowerCase())) n += 1
  return `${clean} (${n})`
}
