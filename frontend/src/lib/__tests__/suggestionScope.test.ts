import { describe, expect, it } from 'vitest'
import { inSuggestionScope, WINDOW_PAGES } from '../suggestionScope'

describe('inSuggestionScope', () => {
  it('shows only the caret page in "current page"', () => {
    expect(inSuggestionScope('page', 12, 12)).toBe(true)
    expect(inSuggestionScope('page', 13, 12)).toBe(false)
  })

  it(`shows ${WINDOW_PAGES} pages either side of the caret in the window`, () => {
    expect(inSuggestionScope('window', 12 - WINDOW_PAGES, 12)).toBe(true)
    expect(inSuggestionScope('window', 12 + WINDOW_PAGES, 12)).toBe(true)
    expect(inSuggestionScope('window', 12 + WINDOW_PAGES + 1, 12)).toBe(false)
  })

  it('shows everything for the whole document, an unknown page, or an unknown caret page', () => {
    expect(inSuggestionScope('all', 900, 1)).toBe(true)
    expect(inSuggestionScope('page', null, 4)).toBe(true)
    expect(inSuggestionScope('window', undefined, 4)).toBe(true)
    expect(inSuggestionScope('page', 40, null)).toBe(true)
  })
})
