import { formatShareCode, generateShareCode, normalizeShareCode } from '../shareCode'

describe('generateShareCode', () => {
  it('makes 8 characters from an alphabet without look-alike characters', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateShareCode()
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
    }
  })

  it('does not repeat in a small sample', () => {
    const codes = new Set(Array.from({ length: 500 }, generateShareCode))
    expect(codes.size).toBe(500)
  })
})

describe('formatShareCode', () => {
  it('groups the code in fours', () => {
    expect(formatShareCode('K7M2QX9P')).toBe('K7M2-QX9P')
  })
})

describe('normalizeShareCode', () => {
  it('accepts what a person types: any case, with or without dash or spaces', () => {
    expect(normalizeShareCode('k7m2-qx9p')).toBe('K7M2QX9P')
    expect(normalizeShareCode(' K7M2 QX9P ')).toBe('K7M2QX9P')
    expect(normalizeShareCode('K7M2QX9P')).toBe('K7M2QX9P')
  })

  it('rejects the wrong length or characters outside the alphabet', () => {
    expect(normalizeShareCode('K7M2')).toBeNull()
    expect(normalizeShareCode('K7M2QX9PZ')).toBeNull()
    expect(normalizeShareCode('K7M2QX9O')).toBeNull() // letter O is not in the alphabet
    expect(normalizeShareCode('K7M2QX91')).toBeNull() // digit 1 is not in the alphabet
    expect(normalizeShareCode('')).toBeNull()
  })

  it('round-trips a generated code through the display format', () => {
    const code = generateShareCode()
    expect(normalizeShareCode(formatShareCode(code))).toBe(code)
  })
})
