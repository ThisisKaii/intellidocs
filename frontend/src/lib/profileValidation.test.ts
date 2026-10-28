import { describe, expect, it } from 'vitest'
import {
  AVATAR_MAX_BYTES,
  checkDisplayName,
  checkNewEmail,
  passwordFormReady,
  passwordProblems,
  validateAvatarFile,
} from './profileValidation'

describe('validateAvatarFile', () => {
  it('accepts PNG, JPG and WebP within 2 MB', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES })).toBeNull()
    expect(validateAvatarFile({ type: 'image/webp', size: 10 })).toBeNull()
  })

  it('names the problem for other types and big files', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPG or WebP/)
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toMatch(/2 MB/)
  })
})

describe('checkDisplayName', () => {
  it('is unchanged, and fine, when it matches the saved name apart from spaces', () => {
    expect(checkDisplayName('  Ana Cruz ', 'Ana Cruz')).toEqual({ changed: false, error: null })
  })

  it('is changed and fine when the name differs', () => {
    expect(checkDisplayName('Ana C.', 'Ana Cruz')).toEqual({ changed: true, error: null })
  })

  it('rejects an empty or very long name', () => {
    expect(checkDisplayName('   ', 'Ana').error).toMatch(/empty/)
    expect(checkDisplayName('x'.repeat(101), 'Ana').error).toMatch(/100/)
  })
})

describe('passwordProblems', () => {
  const base = { hasPassword: true, currentPassword: 'old-password', newPassword: 'new-password-1', confirmPassword: 'new-password-1' }

  it('has no problems for a complete, matching form', () => {
    expect(passwordProblems(base)).toEqual([])
    expect(passwordFormReady(base)).toBe(true)
  })

  it('stays quiet on an untouched form but is not ready', () => {
    const empty = { hasPassword: true, currentPassword: '', newPassword: '', confirmPassword: '' }
    expect(passwordProblems({ ...empty, hasPassword: false })).toEqual([])
    expect(passwordFormReady(empty)).toBe(false)
  })

  it('reports a short password, a mismatch and an unchanged password', () => {
    expect(passwordProblems({ ...base, newPassword: 'short', confirmPassword: '' })[0]).toMatch(/at least 8/)
    expect(passwordProblems({ ...base, confirmPassword: 'other-password' })).toContain('The two new passwords do not match.')
    expect(passwordProblems({ ...base, newPassword: 'old-password', confirmPassword: 'old-password' })[0]).toMatch(/different/)
  })

  it('does not ask a Google-only account for a current password', () => {
    const form = { hasPassword: false, currentPassword: '', newPassword: 'new-password-1', confirmPassword: 'new-password-1' }
    expect(passwordFormReady(form)).toBe(true)
  })
})

describe('checkNewEmail', () => {
  it('accepts a different, well-formed address', () => {
    expect(checkNewEmail('new@school.edu', 'old@school.edu')).toBeNull()
  })

  it('rejects empty, malformed and unchanged addresses', () => {
    expect(checkNewEmail('', 'old@school.edu')).toMatch(/Enter/)
    expect(checkNewEmail('not-an-email', 'old@school.edu')).toMatch(/does not look/)
    expect(checkNewEmail(' OLD@school.edu ', 'old@school.edu')).toMatch(/already/)
  })
})
