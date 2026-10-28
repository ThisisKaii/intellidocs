import { randomInt } from 'crypto'

/** Letters and digits that cannot be mistaken for each other when read aloud or copied (no I, L, O, 0, 1). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/** A new random share code, stored as 8 characters (for example "K7M2QX9P"). */
export function generateShareCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/** The code as people read and type it: two groups of four ("K7M2-QX9P"). */
export function formatShareCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/**
 * What a person typed, as the stored code: upper case, with spaces and dashes removed. Null when the
 * result cannot be a code (wrong length or a character outside the alphabet), so a bad entry never
 * reaches the database.
 */
export function normalizeShareCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((char) => ALPHABET.includes(char)) ? code : null
}
