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
  /** CSS font-style. IEEE uses italic for levels 2 and 3. */
  fontStyle?: 'normal' | 'italic'
  /** CSS text-transform (e.g. 'uppercase' or 'none'). */
  textTransform: 'uppercase' | 'capitalize' | 'none'
  /** Render as small capitals (IEEE section headings). */
  smallCaps?: boolean
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
  /**
   * Optional styling for a heading marked as the document title. Only needed
   * where the title differs from a level 1 section, which is the case for
   * IEEE: sections are uppercase, the title is title case at 24pt.
   */
  title?: HeadingStyle
  /** Margin sets earlier versions of this preset used, so existing documents do not look drifted. */
  legacyMargins?: MarginValues[]
  /** Extra scoped rules appended to the generated stylesheet. */
  extraCss?: string
  /** Scoped stylesheet applied while this preset is active. */
  css: string
}

/** Preset shape before its scoped stylesheet is computed. */
type PresetInput = Omit<AcademicPreset, 'css'>

function headingRule(tag: 'h1' | 'h2' | 'h3', style: HeadingStyle): string {
  const textTransform = style.textTransform === 'none' ? 'none' : style.textTransform
  const fontStyle = style.fontStyle ?? 'normal'
  const fontVariant = style.smallCaps ? 'small-caps' : 'normal'
  return `${tag} {
    text-align: ${style.textAlign};
    font-weight: ${style.fontWeight};
    font-style: ${fontStyle};
    font-variant: ${fontVariant};
    font-size: ${style.fontSize};
    text-transform: ${textTransform};
    margin: 0.5em 0 0.4em;
    text-indent: 0;
  }`
}

/**
 * Rule for a heading carrying the document-title role. Selectors here include
 * the `data-doc-role` attribute, which outranks the bare `h1` rule regardless
 * of source order, so a title can differ from a level 1 section.
 *
 * Every preset emits one, defaulting to its level 1 style. That keeps title
 * alignment under preset control rather than relying on specificity between
 * the base stylesheet and the preset block.
 */
function titleRule(style: HeadingStyle): string {
  const textTransform = style.textTransform === 'none' ? 'none' : style.textTransform
  const fontStyle = style.fontStyle ?? 'normal'
  return `h1[data-doc-role='title'] {
    text-align: ${style.textAlign};
    font-weight: ${style.fontWeight};
    font-style: ${fontStyle};
    font-size: ${style.fontSize};
    text-transform: ${textTransform};
  }`
}

function buildCss(preset: Omit<AcademicPreset, 'css'>): string {
  const headingBlock = [
    headingRule('h1', preset.headings.level1),
    headingRule('h2', preset.headings.level2),
    headingRule('h3', preset.headings.level3),
  ].join('\n')

  const titleBlock = titleRule(preset.title ?? preset.headings.level1)

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
.intellidocs-page-editor .ProseMirror li,
.intellidocs-page-editor .ProseMirror li p {
  ${'text-indent: 0;'}
}
${headingBlock}
${titleBlock}
${preset.extraCss ?? ''}`
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
    'IEEE — Letter, 0.75" top, 1" bottom and 0.625" side margins, Times New Roman 10pt justified, centered small-caps Roman-numeral sections (I. II. III.), italic alphabetised subsections.',
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 0.75, bottom: 1, left: 0.625, right: 0.625 },
  legacyMargins: [{ top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 }],
  extraCss: `
.intellidocs-page-editor .ProseMirror p { text-align: justify; }
.intellidocs-page-editor .ProseMirror h1 { text-align: center; }`,
  fontFamily: "'Times New Roman', Times, serif",
  baseFontSize: '10pt',
  lineHeight: 1.15,
  firstLineIndent: '0.25in',
  headings: {
    level1: { textAlign: 'center', fontSize: '10pt', fontWeight: 400, textTransform: 'none', smallCaps: true },
    level2: { textAlign: 'left', fontSize: '10pt', fontWeight: 400, fontStyle: 'italic', textTransform: 'none', note: 'Italic, alphabetised (A. Speech and Speech Disorders)' },
    level3: { textAlign: 'left', fontSize: '10pt', fontWeight: 400, fontStyle: 'italic', textTransform: 'none', note: 'Italic, run-in (1) Background:)' },
  },
  title: {
    textAlign: 'center',
    fontSize: '24pt',
    fontWeight: 400,
    textTransform: 'none',
    note: '24pt, regular weight, title case as typed',
  },
}

/** UCLM capstone / thesis style: 1.5" binding margin, uppercase chapter headings. */
const UCLM_CAPSTONE: PresetInput = {
  key: 'uclm_capstone',
  name: 'UCLM Capstone (Thesis)',
  description:
    'UCLM spec — 1.5" left binding margin, double-spaced Times New Roman 12pt, uppercase centered chapter headings, roman preliminary page numbers.',
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  fontFamily: "'Times New Roman', Times, serif",
  baseFontSize: '12pt',
  lineHeight: 2,
  firstLineIndent: '0.5in',
  headings: {
    level1: { textAlign: 'center', fontSize: '12pt', fontWeight: 700, textTransform: 'uppercase' },
    level2: { textAlign: 'left', fontSize: '12pt', fontWeight: 700, textTransform: 'none' },
    level3: { textAlign: 'left', fontSize: '12pt', fontWeight: 400, textTransform: 'none', note: 'Italicized' },
  },
}

export const ACADEMIC_PRESETS: AcademicPreset[] = [APA_7TH, IEEE, UCLM_CAPSTONE].map(
  withComputedCss
)

/**
 * Finalize each preset's scoped CSS from its declared styling. Keeps the
 * declarations readable while emitting a full stylesheet at runtime.
 */
export function withComputedCss(preset: PresetInput): AcademicPreset {
  return { ...preset, css: buildCss(preset) }
}

/** The built-in preset a (possibly forked) key derives from: `ieee__v2` -> `ieee`. */
export function basePresetKey(key: string | null | undefined): string | null {
  return key ? key.split('__')[0] : null
}
