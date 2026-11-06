import { ACADEMIC_PRESETS, basePresetKey, type HeadingStyle } from '@/components/editor/academicPresets'
import { lengthToPt } from './inlineStyle'
import type { PresetBodyRules } from './bodyConsistency'
import type { PresetHeadingLook, PresetLineRules } from './shortLineConsistency'

/** The body and short-line rules the scanner checks a document against, read from its academic preset. */
export interface PresetRules {
  body: PresetBodyRules
  lines: PresetLineRules
}

/** A preset heading style as the look the scanner compares against. */
function headingLook(style: HeadingStyle): PresetHeadingLook {
  return {
    textAlign: style.textAlign,
    bold: style.fontWeight >= 600,
    italic: style.fontStyle === 'italic' || /italic/i.test(style.note ?? ''),
    fontSizePt: lengthToPt(style.fontSize) ?? 12,
  }
}

/** The scanner's rules for a preset key (forks resolve to their base preset), or null for no or unknown presets. */
export function presetRulesFor(presetKey: string | null | undefined): PresetRules | null {
  const preset = ACADEMIC_PRESETS.find((candidate) => candidate.key === basePresetKey(presetKey))
  if (!preset) return null
  return {
    body: {
      name: preset.name,
      fontSizePt: lengthToPt(preset.baseFontSize) ?? 12,
      lineHeight: preset.lineHeight,
      firstIndentPt: lengthToPt(preset.firstLineIndent) ?? 0,
    },
    lines: {
      name: preset.name,
      titlePageAlign: preset.titlePageAlign,
      headings: {
        1: headingLook(preset.headings.level1),
        2: headingLook(preset.headings.level2),
        3: headingLook(preset.headings.level3),
      },
    },
  }
}
