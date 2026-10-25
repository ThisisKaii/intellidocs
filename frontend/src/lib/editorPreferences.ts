/**
 * Editor personalization preferences.
 * Stored in localStorage so they survive reloads; changes are broadcast through
 * a window CustomEvent so the editor can rebuild decorations without touching
 * the owning React tree.
 */

import { api } from '../services/api'

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
  /** Show colored dashed boundary guides around formatted preset/style blocks. */
  showStyleGuides: boolean
  /** Formatting suggestions (outlines, chips, panel list) on or off. */
  formattingSuggestions: boolean
  /** Grammar and spelling checking (underlines, panel list) on or off. */
  grammarSuggestions: boolean
}

const STORAGE_KEY = 'intellidocs:editor-preferences'
export const PREFERENCES_CHANGE_EVENT = 'intellidocs:editor-preferences-changed'

export const DEFAULT_PREFERENCES: EditorPreferences = {
  underlineStyle: 'straight',
  sensitivity: 'medium',
  highlightColor: 'indigo',
  showStyleGuides: true,
  formattingSuggestions: true,
  grammarSuggestions: true,
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

/** How long after the last change the account copy is saved, so a burst of clicks makes one request. */
const REMOTE_SAVE_DELAY_MS = 1500
let remoteSaveTimer: ReturnType<typeof setTimeout> | undefined

/** Save the preferences on the account shortly after the last change (only while signed in). */
function scheduleRemoteSave(): void {
  try {
    if (!localStorage.getItem('authToken')) return
  } catch {
    return
  }
  clearTimeout(remoteSaveTimer)
  remoteSaveTimer = setTimeout(() => {
    api.profile.saveEditorPreferences({ ...getEditorPreferences() }).catch(() => {
      // The browser copy still works; the next change tries the account again.
    })
  }, REMOTE_SAVE_DELAY_MS)
}

/**
 * Persist preferences and notify subscribers. Returns the new value. Changes are
 * also saved to the account unless `remote` is false (used when applying the
 * account's own copy, which must not be sent straight back).
 */
export function setEditorPreferences(
  update: Partial<EditorPreferences>,
  options: { remote?: boolean } = {},
): EditorPreferences {
  const next = { ...getEditorPreferences(), ...update }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGE_EVENT, { detail: next }))
  if (options.remote !== false) scheduleRemoteSave()
  return next
}

/** Keep only the fields of a stored copy that have a valid value, so a bad copy can't break the editor. */
export function sanitizePreferences(value: unknown): Partial<EditorPreferences> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const result: Partial<EditorPreferences> = {}
  if (raw.underlineStyle === 'straight' || raw.underlineStyle === 'wavy') result.underlineStyle = raw.underlineStyle
  if (raw.sensitivity === 'low' || raw.sensitivity === 'medium' || raw.sensitivity === 'high') result.sensitivity = raw.sensitivity
  if (['indigo', 'purple', 'emerald', 'amber'].includes(raw.highlightColor as string)) result.highlightColor = raw.highlightColor as HighlightColor
  if (typeof raw.showStyleGuides === 'boolean') result.showStyleGuides = raw.showStyleGuides
  if (typeof raw.formattingSuggestions === 'boolean') result.formattingSuggestions = raw.formattingSuggestions
  if (typeof raw.grammarSuggestions === 'boolean') result.grammarSuggestions = raw.grammarSuggestions
  return result
}

/**
 * On sign-in, make the account's saved preferences the ones in use. An account
 * that has none yet takes this browser's current choices, so nothing is lost.
 */
export async function loadAccountPreferences(): Promise<void> {
  try {
    const { preferences } = await api.profile.getEditorPreferences()
    if (!preferences) {
      scheduleRemoteSave()
      return
    }
    setEditorPreferences(sanitizePreferences(preferences), { remote: false })
  } catch {
    // Offline or signed out: the browser copy keeps working.
  }
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function subscribeEditorPreferences(
  listener: (prefs: EditorPreferences) => void
): () => void {
  const handler = (): void => listener(getEditorPreferences())
  window.addEventListener(PREFERENCES_CHANGE_EVENT, handler)
  return () => window.removeEventListener(PREFERENCES_CHANGE_EVENT, handler)
}