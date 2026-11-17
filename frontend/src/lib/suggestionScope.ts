/**
 * Which suggestions are shown in a long document: those on the page with the caret, those within
 * WINDOW_PAGES pages of it, or all of them. A manuscript of hundreds of pages can have hundreds of
 * grammar and formatting suggestions; listing and underlining every one cluttered the panel and
 * slowed typing. The window follows the caret.
 */

export type SuggestionScope = 'page' | 'window' | 'all'

/** Pages on each side of the caret's page that the default scope covers. */
export const WINDOW_PAGES = 5

const STORAGE_KEY = 'intellidocs.suggestionScope'

export const SCOPE_LABELS: Record<SuggestionScope, string> = {
  page: 'Current page',
  window: `Current ± ${WINDOW_PAGES} pages`,
  all: 'Whole document',
}

/** The remembered scope, or the ±5-page window. */
export function readSuggestionScope(): SuggestionScope {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'page' || stored === 'window' || stored === 'all' ? stored : 'window'
  } catch {
    return 'window'
  }
}

export function storeSuggestionScope(scope: SuggestionScope): void {
  try {
    localStorage.setItem(STORAGE_KEY, scope)
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

/**
 * Whether a suggestion on `page` is shown with the caret on `caretPage`. A suggestion whose page is
 * not known yet (the layout is still settling, or it belongs to the current block) is always shown,
 * and so is everything while the caret's page is unknown.
 */
export function inSuggestionScope(scope: SuggestionScope, page: number | null | undefined, caretPage: number | null): boolean {
  if (scope === 'all' || page == null || caretPage == null) return true
  if (scope === 'page') return page === caretPage
  return Math.abs(page - caretPage) <= WINDOW_PAGES
}
