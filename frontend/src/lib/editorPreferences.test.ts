import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saveEditorPreferences = vi.fn<(prefs: unknown) => Promise<void>>(async () => undefined)
const getAccountPreferences = vi.fn()

vi.mock('../services/api', () => ({
  api: {
    profile: {
      saveEditorPreferences: (prefs: unknown) => saveEditorPreferences(prefs),
      getEditorPreferences: () => getAccountPreferences(),
    },
  },
}))

import {
  DEFAULT_PREFERENCES,
  getEditorPreferences,
  loadAccountPreferences,
  sanitizePreferences,
  setEditorPreferences,
} from './editorPreferences'

describe('editor preferences account sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    saveEditorPreferences.mockClear()
    getAccountPreferences.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not save to the account while signed out', () => {
    setEditorPreferences({ sensitivity: 'high' })
    vi.advanceTimersByTime(5000)
    expect(saveEditorPreferences).not.toHaveBeenCalled()
    expect(getEditorPreferences().sensitivity).toBe('high')
  })

  it('saves once, shortly after a burst of changes', () => {
    localStorage.setItem('authToken', 't')
    setEditorPreferences({ sensitivity: 'high' })
    setEditorPreferences({ underlineStyle: 'wavy' })
    setEditorPreferences({ highlightColor: 'amber' })
    expect(saveEditorPreferences).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(saveEditorPreferences).toHaveBeenCalledTimes(1)
    expect(saveEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 'high', underlineStyle: 'wavy', highlightColor: 'amber' }))
  })

  it('applies the account copy without sending it straight back', async () => {
    localStorage.setItem('authToken', 't')
    getAccountPreferences.mockResolvedValue({ preferences: { ...DEFAULT_PREFERENCES, sensitivity: 'low', highlightColor: 'purple' } })
    await loadAccountPreferences()
    vi.advanceTimersByTime(5000)
    expect(getEditorPreferences()).toMatchObject({ sensitivity: 'low', highlightColor: 'purple' })
    expect(saveEditorPreferences).not.toHaveBeenCalled()
  })

  it('uploads this browser\'s choices when the account has none yet', async () => {
    localStorage.setItem('authToken', 't')
    localStorage.setItem('intellidocs:editor-preferences', JSON.stringify({ ...DEFAULT_PREFERENCES, underlineStyle: 'wavy' }))
    getAccountPreferences.mockResolvedValue({ preferences: null })
    await loadAccountPreferences()
    vi.advanceTimersByTime(2000)
    expect(saveEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({ underlineStyle: 'wavy' }))
  })

  it('keeps working when the account cannot be reached', async () => {
    getAccountPreferences.mockRejectedValue(new Error('offline'))
    await expect(loadAccountPreferences()).resolves.toBeUndefined()
    expect(getEditorPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('sanitizePreferences', () => {
  it('keeps valid fields and drops invalid or unknown ones', () => {
    expect(sanitizePreferences({ underlineStyle: 'wavy', sensitivity: 'extreme', highlightColor: 'pink', showStyleGuides: 'yes', grammarSuggestions: false, other: 1 }))
      .toEqual({ underlineStyle: 'wavy', grammarSuggestions: false })
  })

  it('returns nothing for a non-object', () => {
    expect(sanitizePreferences(null)).toEqual({})
    expect(sanitizePreferences('x')).toEqual({})
  })
})
