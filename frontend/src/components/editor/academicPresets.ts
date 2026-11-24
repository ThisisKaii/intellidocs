import type { PageSizeKey, PageOrientation, MarginValues } from './TiptapEditor'
import type { PresetBlueprint } from '@/services/api'
import { APA_CAPTIONS, IEEE_CAPTIONS, type CaptionConfig } from './captionNumbering'

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
  /** Alignment of every title-page line, for presets whose documents open with a title page. */
  titlePageAlign?: 'left' | 'center' | 'right'
  /** Margin sets earlier versions of this preset used, so existing documents do not look drifted. */
  legacyMargins?: MarginValues[]
  /** Extra scoped rules appended to the generated stylesheet. */
  extraCss?: string
  /** How captions are placed and written in documents using this preset (default: Figure 1 below, Table 1 above). */
  captions?: CaptionConfig
  /** Scoped stylesheet applied while this preset is active. */
  css: string
}

/** Preset shape before its scoped stylesheet is computed. */
type PresetInput = Omit<AcademicPreset, 'css'>

function headingRule(tag: 'h1' | 'h2' | 'h3', style: HeadingStyle): string {
  const textTransform = style.textTransform === 'none' ? 'none' : style.textTransform
  const fontStyle = style.fontStyle ?? 'normal'
  const fontVariant = style.smallCaps ? 'small-caps' : 'normal'
  // Scoped like the editor's own heading rule (.ProseMirror h1 sets 18pt), which a bare `h1` lost to.
  return `.intellidocs-page-editor .ProseMirror ${tag} {
    text-align: ${style.textAlign};
    font-weight: ${style.fontWeight};
    font-style: ${fontStyle};
    font-variant: ${fontVariant};
    font-size: ${style.fontSize};
    text-transform: ${textTransform};
    margin: 0.5em 0 0.4em;
    letter-spacing: normal;
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
  return `.intellidocs-page-editor .ProseMirror h1[data-doc-role='title'] {
    text-align: ${style.textAlign};
    font-weight: ${style.fontWeight};
    font-style: ${fontStyle};
    font-variant: ${style.smallCaps ? 'small-caps' : 'normal'};
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
  captions: APA_CAPTIONS,
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
  titlePageAlign: 'center',
  headings: {
    level1: { textAlign: 'center', fontSize: '12pt', fontWeight: 700, textTransform: 'capitalize' },
    level2: { textAlign: 'left', fontSize: '12pt', fontWeight: 700, textTransform: 'capitalize' },
    level3: { textAlign: 'left', fontSize: '12pt', fontWeight: 700, fontStyle: 'italic', textTransform: 'none', note: 'Bold italic' },
  },
}

/** IEEE conference paper style. */
const IEEE: PresetInput = {
  key: 'ieee',
  captions: IEEE_CAPTIONS,
  name: 'IEEE Conference',
  description:
    'IEEE — Letter, 0.75" top, 1" bottom and 0.625" side margins, Times New Roman 10pt justified, centered small-caps Roman-numeral sections (I. II. III.), italic alphabetized subsections.',
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
    level2: { textAlign: 'left', fontSize: '10pt', fontWeight: 400, fontStyle: 'italic', textTransform: 'none', note: 'Italic, alphabetized (A. Speech and Speech Disorders)' },
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

/**
 * UCLM capstone / thesis style, measured from a UCLM capstone manuscript: 1.5" binding margin,
 * 11pt Times New Roman body justified at 1.5 line spacing with a 0.5" first-line indent, 12pt bold
 * uppercase centered chapter headings, 11pt bold section headings, an 11pt bold all-caps title.
 */
const UCLM_CAPSTONE: PresetInput = {
  key: 'uclm_capstone',
  name: 'UCLM Capstone (Thesis)',
  description:
    'UCLM spec — short bond paper (8.5x11"), 1.5" left binding margin, Times New Roman 11pt justified at 1.5 spacing; 12pt bold uppercase centered chapter headings (CHAPTER I: INTRODUCTION), 11pt bold section headings, roman preliminary page numbers.',
  // UCLM manuscripts are printed on short bond paper: the same 8.5x11" as Letter, named as the school names it.
  pageSize: 'short',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  fontFamily: "'Times New Roman', Times, serif",
  // Body paragraphs and section headings are 11pt; only chapter headings (CHAPTER I, INTRODUCTION) are 12pt.
  baseFontSize: '11pt',
  lineHeight: 1.5,
  firstLineIndent: '0.5in',
  titlePageAlign: 'center',
  extraCss: `
.intellidocs-page-editor .ProseMirror p { text-align: justify; }`,
  headings: {
    level1: { textAlign: 'center', fontSize: '12pt', fontWeight: 700, textTransform: 'uppercase' },
    level2: { textAlign: 'left', fontSize: '11pt', fontWeight: 700, textTransform: 'none' },
    level3: { textAlign: 'left', fontSize: '11pt', fontWeight: 400, fontStyle: 'italic', textTransform: 'none', note: 'Italicized' },
  },
  title: { textAlign: 'center', fontSize: '11pt', fontWeight: 700, textTransform: 'uppercase', note: '11pt bold, all caps' },
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

/** Window event sent after the user makes, imports or deletes a preset, so open pages reload them. */
export const USER_PRESETS_CHANGED = 'intellidocs:user-presets-changed'

/** The user's own presets that carry a blueprint, by key (filled when their presets load). */
const userPresetRegistry = new Map<string, AcademicPreset>()

/** CSS-safe font list from a blueprint (the server checks it too). */
function safeFamily(family: string): string {
  return /^[\w\s'",.-]+$/.test(family) ? family : "'Times New Roman', Times, serif"
}

/** A preset whose look was read from a document: the same shape as a built-in one. */
export function presetFromBlueprint(key: string, name: string, description: string, blueprint: PresetBlueprint): AcademicPreset {
  const heading = (style: PresetBlueprint['headings']['level1']): HeadingStyle => ({
    textAlign: style.textAlign,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle ?? 'normal',
    textTransform: style.textTransform,
  })
  return withComputedCss({
    key,
    name,
    description,
    pageSize: blueprint.pageSize,
    orientation: blueprint.orientation,
    margins: blueprint.margins,
    fontFamily: safeFamily(blueprint.fontFamily),
    baseFontSize: blueprint.baseFontSize,
    lineHeight: blueprint.lineHeight,
    firstLineIndent: blueprint.firstLineIndent,
    titlePageAlign: 'center',
    headings: { level1: heading(blueprint.headings.level1), level2: heading(blueprint.headings.level2), level3: heading(blueprint.headings.level3) },
    extraCss: blueprint.bodyAlign === 'left' ? '' : `\n.intellidocs-page-editor .ProseMirror p { text-align: ${blueprint.bodyAlign}; }`,
  })
}

/** Remember the user's blueprint presets so documents bound to them get their look. */
export function registerUserPresets(presets: Array<{ key: string; name: string; description: string; blueprint?: PresetBlueprint | null }>): void {
  userPresetRegistry.clear()
  for (const preset of presets) {
    if (preset.blueprint) userPresetRegistry.set(preset.key, presetFromBlueprint(preset.key, preset.name, preset.description, preset.blueprint))
  }
}

/** The user's presets that carry a blueprint. */
export function registeredUserPresets(): AcademicPreset[] {
  return Array.from(userPresetRegistry.values())
}

/**
 * The preset a document's key names: one of the user's blueprint presets, else the built-in
 * preset the key derives from (`ieee__v2` → IEEE).
 */
export function findAcademicPreset(key: string | null | undefined): AcademicPreset | undefined {
  if (!key) return undefined
  return userPresetRegistry.get(key) ?? ACADEMIC_PRESETS.find((preset) => preset.key === basePresetKey(key))
}

/** The built-in preset a (possibly forked) key derives from: `ieee__v2` -> `ieee`. */
export function basePresetKey(key: string | null | undefined): string | null {
  return key ? key.split('__')[0] : null
}
