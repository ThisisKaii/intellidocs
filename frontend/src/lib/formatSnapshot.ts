import type { PageNumberFormat } from '@/services/api'

/** Format state bundled into a version snapshot via the editor_prefs column. */
export interface FormatSnapshot {
  formatting_history: string[]
  formatting_preset: string | null
  header_content: string
  footer_content: string
  show_header: boolean
  show_footer: boolean
  header_number_format: PageNumberFormat
  footer_number_format: PageNumberFormat
}

/** Default format state used when a version predates format capture. */
const DEFAULT_FORMAT_SNAPSHOT: FormatSnapshot = {
  formatting_history: [],
  formatting_preset: null,
  header_content: '',
  footer_content: '',
  show_header: false,
  show_footer: false,
  header_number_format: 'none',
  footer_number_format: 'none',
}

/** Parse a version's editor_prefs into a typed format snapshot (defensive). */
export function readFormatSnapshot(
  raw: Record<string, unknown> | null | undefined,
): FormatSnapshot {
  if (!raw || typeof raw !== 'object') return DEFAULT_FORMAT_SNAPSHOT

  const toArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  const toBool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  const toNumberFormat = (value: unknown): PageNumberFormat =>
    value === 'number' || value === 'roman' ? value : 'none'

  return {
    formatting_history: toArray(raw.formatting_history),
    formatting_preset: typeof raw.formatting_preset === 'string' ? raw.formatting_preset : null,
    header_content: typeof raw.header_content === 'string' ? raw.header_content : '',
    footer_content: typeof raw.footer_content === 'string' ? raw.footer_content : '',
    show_header: toBool(raw.show_header, false),
    show_footer: toBool(raw.show_footer, false),
    header_number_format: toNumberFormat(raw.header_number_format),
    footer_number_format: toNumberFormat(raw.footer_number_format),
  }
}