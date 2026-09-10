import { useEffect, useState } from 'react'
import {
  getEditorPreferences,
  subscribeEditorPreferences,
  type EditorPreferences,
} from '@/lib/editorPreferences'

/** Reactive access to editor personalization preferences. */
export function useEditorPreferences(): EditorPreferences {
  const [prefs, setPrefs] = useState<EditorPreferences>(() => getEditorPreferences())

  useEffect(() => subscribeEditorPreferences(setPrefs), [])

  return prefs
}