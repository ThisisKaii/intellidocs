import { DocumentGenre } from '../types/index'

/** Every genre that partitions behavior learning, in display order. */
export const DOCUMENT_GENRES: readonly DocumentGenre[] = ['ieee', 'thesis', 'memo', 'general'] as const

/** Base formatting-preset keys and the genre each one belongs to. Unlisted keys are 'general'. */
const PRESET_GENRES: Record<string, DocumentGenre> = {
  ieee: 'ieee',
  uclm_capstone: 'thesis',
  thesis: 'thesis',
  academic: 'thesis',
  business_letter: 'memo',
}

/** Map a formatting-preset key (forks such as `ieee__v2` use their base key) to its genre. */
export function genreForPreset(presetKey: string | null | undefined): DocumentGenre {
  if (!presetKey) return 'general'
  const base = presetKey.split('__')[0]
  return PRESET_GENRES[base] ?? 'general'
}

/** Narrow an unknown value to a DocumentGenre. */
export function isDocumentGenre(value: unknown): value is DocumentGenre {
  return typeof value === 'string' && (DOCUMENT_GENRES as readonly string[]).includes(value)
}

/**
 * The genre a stored document belongs to. Rows cached before migration 038 have no `genre`
 * column, so they fall back to the genre of their formatting preset.
 */
export function resolveDocumentGenre(doc: { genre?: unknown; formatting_preset?: string | null }): DocumentGenre {
  return isDocumentGenre(doc.genre) ? doc.genre : genreForPreset(doc.formatting_preset)
}

/** Genre-scoped fallback preset (formatting_presets key) used when the genre partition has no answer. */
export const GENRE_BASE_PRESET_KEY: Record<DocumentGenre, string> = {
  ieee: 'ieee_base',
  thesis: 'thesis',
  memo: 'business_letter',
  general: 'general',
}
