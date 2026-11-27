/**
 * Resolve first and last name from account names, falling back to `displayName`
 * for Google OAuth accounts that only carry `full_name` / `name`.
 */
export function resolveApplicantNames(names: {
  firstName: string | null
  lastName: string | null
  displayName: string | null
}): { firstName: string; lastName: string } {
  const first = names.firstName?.trim() ?? ''
  const last = names.lastName?.trim() ?? ''
  if (first && last) return { firstName: first, lastName: last }

  const display = names.displayName?.trim() ?? ''
  if (!display) return { firstName: first, lastName: last }

  if (display.includes(',')) {
    const [lastSide, firstSide] = display.split(',').map((s) => s.trim())
    return {
      firstName: first || firstSide || '',
      lastName: last || lastSide || '',
    }
  }

  const words = display.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return {
      firstName: first || words.slice(0, -1).join(' '),
      lastName: last || words[words.length - 1],
    }
  }

  return { firstName: first, lastName: last }
}

/**
 * Match user first and last names against text extracted from an official study load document.
 * Handles common academic registrar naming permutations such as:
 * - "ASINGUA, JOSHUA L. (23249600)"
 * - "Joshua L. Asingua"
 * - "Joshua Asingua"
 * - "Asingua, Joshua"
 */
export function checkStudyLoadNameMatch(text: string, firstName: string, lastName: string): boolean {
  if (!text.trim() || !firstName.trim() || !lastName.trim()) return false
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')

  const firstParts = firstName.toLowerCase().trim().split(/\s+/).filter((p) => p.length >= 2)
  const lastParts = lastName.toLowerCase().trim().split(/\s+/).filter((p) => p.length >= 2)

  if (firstParts.length === 0 || lastParts.length === 0) return false

  const matchesLast = lastParts.every((part) => clean.includes(part))
  const matchesFirst = firstParts.some((part) => clean.includes(part))

  return matchesLast && matchesFirst
}
