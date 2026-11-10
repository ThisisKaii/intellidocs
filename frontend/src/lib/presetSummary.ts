import type { AcademicPreset } from '@/components/editor/academicPresets'

/** The first family of a CSS font stack ("'Times New Roman', Times, serif" -> "Times New Roman"). */
export function presetFontFamily(preset: Pick<AcademicPreset, 'fontFamily'>): string {
  const first = preset.fontFamily.split(',')[0] ?? ''
  return first.trim().replace(/^['"]|['"]$/g, '')
}

/** Line spacing in words: "double spacing", "1.15 line spacing". */
function spacingWords(lineHeight: number): string {
  if (lineHeight === 2) return 'double spacing'
  if (lineHeight === 1) return 'single spacing'
  return `${lineHeight} line spacing`
}

/** "1in" for a whole number of inches, "1.5in" otherwise. */
function inches(value: number): string {
  return `${Math.round(value * 100) / 100}in`
}

/** Margins in words: "1in margins" when equal, else each side. */
function marginWords(margins: AcademicPreset['margins']): string {
  const { top, bottom, left, right } = margins
  if (top === bottom && bottom === left && left === right) return `${inches(top)} margins`
  return `margins ${inches(top)} top, ${inches(bottom)} bottom, ${inches(left)} left, ${inches(right)} right`
}

/**
 * What applying a preset sets up, in one line for the confirmation toast:
 * "Applied UCLM Capstone (Thesis): margins 1in top, 1in bottom, 1.5in left,
 * 1in right · Times New Roman 12pt · double spacing · 0.5in first-line indent."
 */
export function describePresetChanges(preset: Pick<AcademicPreset, 'name' | 'margins' | 'fontFamily' | 'baseFontSize' | 'lineHeight' | 'firstLineIndent'>): string {
  const parts = [marginWords(preset.margins), `${presetFontFamily(preset)} ${preset.baseFontSize}`, spacingWords(preset.lineHeight)]
  if (preset.firstLineIndent && !/^0(?:\.0+)?(?:in|pt|px|cm)?$/.test(preset.firstLineIndent.trim())) {
    parts.push(`${preset.firstLineIndent} first-line indent`)
  }
  return `Applied ${preset.name}: ${parts.join(' · ')}.`
}
