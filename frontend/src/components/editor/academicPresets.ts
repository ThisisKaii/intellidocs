import type { PageSizeKey, PageOrientation, MarginValues } from './TiptapEditor'

/**
 * One-click academic formatting presets. Each preset drives:
 *   - page geometry (size, orientation, margins) via the editor's page commands
 *   - typography + heading conventions through a scoped CSS block
 *   - a persisted `formatting_preset` key so Tier-1 rule sets stay in sync
 */

export interface HeadingStyle {
  /** Text alignment for this heading level. */
  textAlign: 'left' | 'center' | 'right'
  /** Font size in pt. */
  fontSize: string
  /** CSS font-weight (700 = bold). */
  fontWeight: number
  /** CSS text-transform (e.g. 'uppercase' or 'none'). */
  textTransform: 'uppercase' | 'capitalize' | 'none'
  /** Extra note shown in the UI (e.g. "Ends with a period"). */
  note?: string
}

export interface AcademicPreset {
  key: string
  name: string
  description: string
  pageSize: PageSizeKey
  orientation: PageOrientation
  margins: MarginValues
  fontFamily: string
  baseFontSize: string
  lineHeight: number
  firstLineIndent: string
  headings: { level1: HeadingStyle; level2: HeadingStyle; level3: HeadingStyle }
  /** Scoped stylesheet applied while this preset is active. */
  css: string
}

/** Preset shape before its scoped stylesheet is computed. */
type PresetInput = Omit<AcademicPreset, 'css'>

function headingRule(tag: 'h1' | 'h2' | 'h3', style: HeadingStyle): string {
  const textTransform = style.textTransform === 'none' ? 'none' : style.textTransform
  return `${tag} {
    text-align: ${style.textAlign};
    font-weight: ${style.fontWeight};
    font-size: ${style.fontSize};
    text-transform: ${textTransform};
    margin: 0.5em 0 0.4em;
    text-indent: 0;
  }`
}

function buildCss(preset: Omit<AcademicPreset, 'css'>): string {
  const headingBlock = [
    headingRule('h1', preset.headings.level1),
    headingRule('h2', preset.headings.level2),
    headingRule('h3', preset.headings.level3),
  ].join('\n')

  return `
.intellidocs-page-editor .ProseMirror {
  font-family: ${preset.fontFamily};
  font-size: ${preset.baseFontSize};
  line-height: ${preset.lineHeight};
}
.intellidocs-page-editor .ProseMirror p {
  text-indent: ${preset.firstLineIndent};
  margin: 0;
  text-align: left;
}
.intellidocs-page-editor .ProseMirror h1,
.intellidocs-page-editor .ProseMirror h2,
.intellidocs-page-editor .ProseMirror h3,
.intellidocs-page-editor .ProseMirror blockquote,
.intellidocs-page-editor .ProseMirror li {
  ${'text-indent: 0;'}
}
${headingBlock}`
}

/** UCLM Capstone Thesis specification (from the dean requirements). */
const UCLM_CAPSTONE: PresetInput = {
  key: 'uclm_capstone',
  name: 'UCLM Capstone (Thesis)',
  description:
    "UCLM spec — left margin 1.5\", double-spaced Arial/Times 12pt, uppercase centered chapter headings, roman preliminary page numbers.",
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  fontFamily: "Arial, 'Times New Roman', serif",
  baseFontSize: '12pt',
  lineHeight: 2,
  firstLineIndent: '0.5in',
  headings: {
    level1: {
      textAlign: 'center',
      fontSize: '14pt',
      fontWeight: 700,
      textTransform: 'uppercase',
      note: 'Centered, bold, uppercase',
    },
    level2: {
      textAlign: 'left',
      fontSize: '12pt',
      fontWeight: 700,
      textTransform: 'capitalize',
      note: 'Left, bold, title case',
    },
    level3: {
      textAlign: 'left',
      fontSize: '12pt',
      fontWeight: 700,
      textTransform: 'none',
      note: 'Indented 0.5", bold, ends with a period',
    },
  },
}

/** APA 7th Edition academic paper style. */
const APA_7TH: PresetInput = {
  key: 'apa_7th',
  name: 'APA 7th Edition',
  description:
    "APA 7 — 1\" margins, Times New Roman 12pt, double-spaced, hanging-style centered title, five-level headings.",
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
  fontFamily: "'Times New Roman', Times, serif",
  baseFontSize: '12pt',
  lineHeight: 2,
  firstLineIndent: '0.5in',
  headings: {
    level1: { textAlign: 'center', fontSize: '12pt', fontWeight: 700, textTransform: 'capitalize' },
    level2: { textAlign: 'left', fontSize: '12pt', fontWeight: 700, textTransform: 'capitalize' },
    level3: { textAlign: 'left', fontSize: '12pt', fontWeight: 700, textTransform: 'none', note: 'Bold italic' },
  },
}

/** IEEE conference paper style. */
const IEEE: PresetInput = {
  key: 'ieee',
  name: 'IEEE Conference',
  description:
    "IEEE — 0.75\" margins, Times New Roman 10pt, single-ish spacing, Roman-numeral numbered headings.",
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
  fontFamily: "'Times New Roman', Times, serif",
  baseFontSize: '10pt',
  lineHeight: 1.15,
  firstLineIndent: '0.25in',
  headings: {
    level1: { textAlign: 'center', fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase' },
    level2: { textAlign: 'left', fontSize: '10pt', fontWeight: 700, textTransform: 'none' },
    level3: { textAlign: 'left', fontSize: '10pt', fontWeight: 400, textTransform: 'none', note: 'Italicized' },
  },
}

export const ACADEMIC_PRESETS: AcademicPreset[] = [UCLM_CAPSTONE, APA_7TH, IEEE].map(withComputedCss)

/**
 * Finalize each preset's scoped CSS from its declared styling. Keeps the
 * declarations readable while emitting a full stylesheet at runtime.
 */
export function withComputedCss(preset: PresetInput): AcademicPreset {
  return { ...preset, css: buildCss(preset) }
}