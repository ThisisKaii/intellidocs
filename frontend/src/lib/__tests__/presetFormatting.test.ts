import { describe, expect, it } from 'vitest'
import { isTypographyOverride, structuralRole } from '../presetFormatting'

describe('preset-governed formatting', () => {
  it('knows which predicted formats are structural roles a preset styles', () => {
    expect(structuralRole('heading2')).toBe('h2')
    expect(structuralRole('h1')).toBe('h1')
    expect(structuralRole('title')).toBe('title')
    expect(structuralRole('bold')).toBeNull()
    expect(structuralRole('ordered_list')).toBeNull()
  })

  it('counts typography restyles, not structure or insertions, as overriding the preset', () => {
    for (const action of ['bold', 'italic', 'font_size', 'font_family', 'align_center', 'indent']) expect(isTypographyOverride(action)).toBe(true)
    for (const action of ['insert_image', 'page_break', 'undo', 'bullet_list']) expect(isTypographyOverride(action)).toBe(false)
  })
})
