import { beforeEach, describe, expect, it } from 'vitest'
import { loadSuggestionMemory, rememberSuggestion } from './suggestionMemory'

describe('suggestion memory', () => {
  beforeEach(() => window.localStorage.clear())

  it('remembers a decision per document', () => {
    rememberSuggestion('doc-1', 'abc:heading1', 'accepted')
    expect(loadSuggestionMemory('doc-1')['abc:heading1']).toBe('accepted')
    expect(loadSuggestionMemory('doc-2')).toEqual({})
  })

  it('is empty without a document id and survives corrupt storage', () => {
    rememberSuggestion(undefined, 'k', 'dismissed')
    window.localStorage.setItem('intellidocs.suggestionMemory.bad', '{not json')
    expect(loadSuggestionMemory(undefined)).toEqual({})
    expect(loadSuggestionMemory('bad')).toEqual({})
  })

  it('keeps the memory bounded', () => {
    for (let i = 0; i < 520; i++) rememberSuggestion('big', `k${i}`, 'accepted')
    const memory = loadSuggestionMemory('big')
    expect(Object.keys(memory)).toHaveLength(500)
    expect(memory.k519).toBe('accepted')
    expect(memory.k0).toBeUndefined()
  })
})
