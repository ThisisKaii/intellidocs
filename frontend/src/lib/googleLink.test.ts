import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearGoogleLinking, isGoogleLinking, linkErrorMessage, markGoogleLinking, readCallbackError } from './googleLink'

describe('readCallbackError', () => {
  it('reads an error from the query (PKCE flow)', () => {
    expect(readCallbackError({ search: '?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user', hash: '' }))
      .toEqual({ code: 'identity_already_exists', description: 'Identity is already linked to another user' })
  })

  it('reads an error from the hash (implicit flow)', () => {
    expect(readCallbackError({ search: '', hash: '#error=access_denied&error_description=User+denied' }))
      .toEqual({ code: 'access_denied', description: 'User denied' })
  })

  it('returns null for a normal callback', () => {
    expect(readCallbackError({ search: '?code=abc', hash: '#access_token=x' })).toBeNull()
  })
})

describe('linking marker', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearGoogleLinking()
  })

  it('survives repeated reads until cleared', () => {
    markGoogleLinking()
    expect(isGoogleLinking()).toBe(true)
    expect(isGoogleLinking()).toBe(true)
    clearGoogleLinking()
    expect(isGoogleLinking()).toBe(false)
  })

  it('expires so an abandoned link does not hijack a later sign-in', () => {
    vi.useFakeTimers()
    markGoogleLinking()
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(isGoogleLinking()).toBe(false)
  })
})

describe('linkErrorMessage', () => {
  it('explains a Google account that belongs to another user', () => {
    expect(linkErrorMessage('identity_already_exists', 'x')).toMatch(/already used by another IntelliDocs account/)
  })
})
