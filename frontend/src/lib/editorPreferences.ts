/**
 * Editor personalization preferences.
 * Stored in localStorage so they survive reloads; changes are broadcast through
 * a window CustomEvent so the editor can rebuild decorations without touching
 * the owning React tree.
 */

export type UnderlineStyle = 'straight' | 'wavy'

export type SuggestionSensitivity = 'low' | 'medium' | 'high'

export type HighlightColor = 'indigo' | 'purple' | 'emerald' | 'amber'

export interface EditorPreferences {
  /** Underline style for grammar (red) and spelling (amber) issues. */
  underlineStyle: UnderlineStyle
  /** Scanner sensitivity — controls the confidence threshold for auto-format prompts. */
  sensitivity: SuggestionSensitivity
  /** Accent color for in-canvas formatting suggestion highlights. */
  highlightColor: HighlightColor
}

const STORAGE_KEY = 'intellidocs:editor-preferences'
export const PREFERENCES_CHANGE_EVENT = 'intellidocs:editor-preferences-changed'

export const DEFAULT_PREFERENCES: EditorPreferences = {
  underlineStyle: 'straight',
  sensitivity: 'medium',
  highlightColor: 'indigo',
}

/** Map a chosen sensitivity to a minimum confidence the scanner must reach. */
export function confidenceThreshold(prefs: EditorPreferences): number {
  switch (prefs.sensitivity) {
    case 'low':
      return 0.55
    case 'high':
      return 0.8
    default:
      return 0.68
  }
}

/** Map a chosen accent color to its CSS color value. */
export function highlightColorCss(prefs: EditorPreferences): string {
  switch (prefs.highlightColor) {
    case 'purple':
      return '#7c3aed'
    case 'emerald':
      return '#059669'
    case 'amber':
      return '#d97706'
    default:
      return '#6366f1'
  }
}

/** Load the persisted preferences, falling back to defaults on any error. */
export function getEditorPreferences(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<EditorPreferences>
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

/** Persist preferences and notify subscribers. Returns the new value. */
export function setEditorPreferences(update: Partial<EditorPreferences>): EditorPreferences {
  const next = { ...getEditorPreferences(), ...update }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGE_EVENT, { detail: next }))
  return next
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function subscribeEditorPreferences(
  listener: (prefs: EditorPreferences) => void
): () => void {
  const handler = (): void => listener(getEditorPreferences())
  window.addEventListener(PREFERENCES_CHANGE_EVENT, handler)
  return () => window.removeEventListener(PREFERENCES_CHANGE_EVENT, handler)
}