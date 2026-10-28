import { describe, expect, it } from 'vitest'
import { formatCodeInput } from './JoinCodeModal'

describe('formatCodeInput', () => {
  it('upper-cases and puts a dash after four characters as the person types', () => {
    expect(formatCodeInput('k7m')).toBe('K7M')
    expect(formatCodeInput('k7m2q')).toBe('K7M2-Q')
    expect(formatCodeInput('k7m2qx9p')).toBe('K7M2-QX9P')
  })

  it('drops spaces, dashes and other characters, and stops at eight', () => {
    expect(formatCodeInput(' k7m2 - qx9p ')).toBe('K7M2-QX9P')
    expect(formatCodeInput('k7m2qx9pzzzz')).toBe('K7M2-QX9P')
    expect(formatCodeInput('!!')).toBe('')
  })
})
