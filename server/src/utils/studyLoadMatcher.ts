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
