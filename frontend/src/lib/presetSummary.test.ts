import { describe, expect, it } from 'vitest'
import { ACADEMIC_PRESETS } from '@/components/editor/academicPresets'
import { describePresetChanges, presetFontFamily } from './presetSummary'

const byKey = (key: string) => {
  const preset = ACADEMIC_PRESETS.find((candidate) => candidate.key === key)
  if (!preset) throw new Error(`missing preset ${key}`)
  return preset
}

describe('describePresetChanges', () => {
  it('describes the UCLM capstone setup side by side', () => {
    expect(describePresetChanges(byKey('uclm_capstone'))).toBe(
      'Applied UCLM Capstone (Thesis): margins 1in top, 1in bottom, 1.5in left, 1in right · Times New Roman 11pt · double spacing · 0.5in first-line indent.'
    )
  })

  it('says "1in margins" when every side is the same', () => {
    expect(describePresetChanges(byKey('apa_7th'))).toBe(
      'Applied APA 7th Edition: 1in margins · Times New Roman 12pt · double spacing · 0.5in first-line indent.'
    )
  })

  it('reads the first family of a font stack', () => {
    expect(presetFontFamily({ fontFamily: "'Times New Roman', Times, serif" })).toBe('Times New Roman')
    expect(presetFontFamily({ fontFamily: 'Arial, sans-serif' })).toBe('Arial')
  })
})
