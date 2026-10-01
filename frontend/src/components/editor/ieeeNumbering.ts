/**
 * IEEE conference heading numbering.
 *
 * IEEE numbers section headings in three tiers:
 *   Level 1  I. INTRODUCTION          (uppercase Roman numeral)
 *   Level 2  A. Speech Disorders      (uppercase letter)
 *   Level 3  1) Background:           (Arabic numeral, parenthesised)
 *
 * Numbering is produced as literal text rather than CSS counters or
 * `text-transform`, because literal text survives HTML -> DOCX export
 * while CSS-generated content does not.
 */

export type IeeeHeadingLevel = 1 | 2 | 3

export interface IeeeHeadingInput {
  /** Heading tier, 1 to 3. */
  level: IeeeHeadingLevel
  /**
   * When false the heading receives no number and does not advance the
   * counters. Used for the paper title, Abstract, Index Terms and References,
   * which IEEE sets apart from numbered sections.
   */
  numbered?: boolean
}

/** Converts a positive integer to an uppercase Roman numeral. */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) {
    return ''
  }

  const table: ReadonlyArray<readonly [number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]

  let remaining = value
  let out = ''
  for (const [amount, symbol] of table) {
    while (remaining >= amount) {
      out += symbol
      remaining -= amount
    }
  }
  return out
}

/** Converts a positive integer to an uppercase letter (A, B, ... Z, AA, AB). */
export function toAlphaLabel(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    return ''
  }

  let remaining = value
  let out = ''
  while (remaining > 0) {
    const index = (remaining - 1) % 26
    out = String.fromCharCode(65 + index) + out
    remaining = Math.floor((remaining - 1) / 26)
  }
  return out
}

/**
 * Computes the IEEE number for each heading in document order.
 *
 * Counters reset following IEEE hierarchy rules: a new level 1 restarts the
 * level 2 letters, and a new level 2 restarts the level 3 numerals. Headings
 * marked `numbered: false` are skipped without disturbing the counters, so a
 * References section at the end does not renumber anything above it.
 */
export function computeIeeeNumbers(
  headings: readonly IeeeHeadingInput[]
): string[] {
  let level1 = 0
  let level2 = 0
  let level3 = 0

  return headings.map((heading) => {
    if (heading.numbered === false) {
      return ''
    }

    if (heading.level === 1) {
      level1 += 1
      level2 = 0
      level3 = 0
      return `${toRoman(level1)}.`
    }

    if (heading.level === 2) {
      level2 += 1
      level3 = 0
      return `${toAlphaLabel(level2)}.`
    }

    level3 += 1
    return `${level3})`
  })
}

/**
 * Builds the full IEEE heading label, e.g. `I. INTRODUCTION` or `A. Speech
 * Disorders`, by joining a computed number with the heading's own text.
 * Returns the heading text unchanged when it carries no number.
 */
export function formatIeeeHeading(number: string, text: string): string {
  const trimmed = text.trim()
  if (number === '') {
    return trimmed
  }
  return `${number} ${trimmed}`
}

/**
 * Headings IEEE sets apart from numbered sections. Matched case-insensitively
 * after any existing number prefix is removed.
 */
const UNNUMBERED_HEADINGS: readonly string[] = [
  'abstract',
  'index terms',
  'keywords',
  'references',
  'acknowledgment',
  'acknowledgement',
  'acknowledgments',
  'acknowledgements',
]

/**
 * Matches a leading IEEE label such as `I.`, `IV.`, `A.` or `1)` followed by
 * whitespace. Used to strip an already-applied number so renumbering is
 * idempotent rather than producing `I. I. INTRODUCTION`.
 */
const LEADING_NUMBER = /^\s*(?:[IVXLCDM]+|[A-Z]|\d{1,2})\s*[.)]\s+/i

/** Removes a leading IEEE number label from heading text, if present. */
export function stripIeeeNumber(text: string): string {
  return text.replace(LEADING_NUMBER, '').trim()
}

/**
 * Reports whether a heading is one IEEE leaves unnumbered. The heading text is
 * stripped of any leading number first, so `I. References` is still detected.
 */
export function isUnnumberedIeeeHeading(text: string): boolean {
  const bare = stripIeeeNumber(text).toLowerCase()
  return UNNUMBERED_HEADINGS.includes(bare)
}

/** A heading paired with the text it currently shows. */
export interface IeeeHeadingText {
  level: IeeeHeadingLevel
  text: string
}

/**
 * Renumbers headings end to end, returning the text each heading should show.
 *
 * Any existing number prefix is stripped before recomputing, so calling this
 * repeatedly on the same headings is idempotent. Headings IEEE leaves
 * unnumbered (Abstract, Index Terms, References, Acknowledgment) are returned
 * with their existing number prefix removed but no new number added.
 */
export function applyIeeeNumberingToTexts(
  headings: readonly IeeeHeadingText[]
): string[] {
  const prepared = headings.map((heading) => ({
    level: heading.level,
    text: stripIeeeNumber(heading.text),
    numbered: !isUnnumberedIeeeHeading(heading.text),
  }))

  const numbers = computeIeeeNumbers(prepared)

  return prepared.map((heading, index) =>
    formatIeeeHeading(heading.numbered ? numbers[index] : '', heading.text)
  )
}
