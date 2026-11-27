import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACADEMIC_WORDS, academicDictionary, isRomanNumeral } from './academicVocabulary'

/** The quoted entries of the server checker's ACADEMIC_WHITELIST (alphabetic, 3+ letters). */
function serverWhitelist(): string[] {
  const source = readFileSync(resolve(__dirname, '../../../../ml/grammar/spell_checker.py'), 'utf-8')
  const start = source.indexOf('ACADEMIC_WHITELIST')
  const body = source.slice(source.indexOf('{', start), source.indexOf('})', start))
  const words = [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  return [...new Set(words.filter((word) => /^[a-z]{3,}$/i.test(word)))].sort()
}

describe('academic vocabulary', () => {
  it('matches the server spelling checker whitelist', () => {
    expect([...ACADEMIC_WORDS].sort()).toEqual(serverWhitelist())
  })

  it('gives Harper lowercase words and capitalised acronyms, never capitalised words', () => {
    const words = academicDictionary()
    expect(words).toContain('ANOVA')
    expect(words).toContain('heteroscedasticity')
    // A capitalised entry reads as a proper noun to Harper and flags the lowercase spelling.
    expect(words).not.toContain('Heteroscedasticity')
  })
})

describe('isRomanNumeral', () => {
  it('accepts chapter, part and page numerals', () => {
    for (const word of ['II', 'iv', 'XII', '(iii)', 'xiv.', 'MCMXCIX']) expect(isRomanNumeral(word)).toBe(true)
  })
  it('rejects ordinary words and malformed numerals', () => {
    for (const word of ['teh', 'iiii', 'vx', 'chapter', '']) expect(isRomanNumeral(word)).toBe(false)
  })
})
