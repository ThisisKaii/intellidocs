const OUTLINE_MARKER = 'Document outline:'
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** Convert a roman numeral ("iii", "xiv") to a number, or null when it is not one. */
function romanToNumber(roman: string): number | null {
  if (!/^[ivxlcdm]+$/.test(roman)) return null
  let total = 0
  for (let i = 0; i < roman.length; i += 1) {
    const value = ROMAN_VALUES[roman[i]]
    const next = ROMAN_VALUES[roman[i + 1]] ?? 0
    total += value < next ? -value : value
  }
  return total
}

/**
 * Normalize a section reference for matching: lowercase, collapsed spaces,
 * and roman numerals after "chapter"/"section" turned into digits, so
 * "CHAPTER III" and "chapter 3" compare equal.
 */
export function normalizeSectionKey(text: string): string {
  const flat = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return flat.replace(/\b(chapter|section)\s+([ivxlcdm]+)\b/g, (match: string, word: string, roman: string): string => {
    const value = romanToNumber(roman)
    return value === null ? match : `${word} ${value}`
  })
}

/** Section lines listed in the "Document outline:" block the editor sends with each chat request. */
export function listOutlineSections(documentContent: string): string[] {
  const start = documentContent.indexOf(OUTLINE_MARKER)
  if (start === -1) return []
  const block = documentContent.slice(start + OUTLINE_MARKER.length)
  const end = block.search(/\n\s*\n/)
  const lines = (end === -1 ? block : block.slice(0, end)).split('\n')
  return lines
    .map((line: string): string => line.replace(/^\s*-\s*/, '').trim())
    .filter((line: string): boolean => line.length > 0)
}

/**
 * Whether the document contains a named target: in its outline, or anywhere in
 * the text excerpt the editor sent. The title is always present.
 */
export function documentHasTarget(documentContent: string, target: string, mode: 'literal' | 'section' | 'title' | null): boolean {
  if (mode === 'title') return true
  const key = normalizeSectionKey(target)
  if (key.length === 0) return true
  const haystack = [normalizeSectionKey(documentContent), ...listOutlineSections(documentContent).map(normalizeSectionKey)]
  return haystack.some((text) => text.includes(key))
}
