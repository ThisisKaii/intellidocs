import { describe, expect, it } from 'vitest'
import { firstLineIndentPx, withoutFirstLineIndent } from './IndentExtension'

describe('first-line indent (Backspace at the start of a paragraph)', () => {
  it('reads text-indent in any unit', () => {
    expect(firstLineIndentPx('font-size:11pt; text-indent:48.0px; margin-left:24px')).toBe(48)
    expect(firstLineIndentPx('text-indent: 36pt')).toBe(48)
    expect(firstLineIndentPx('text-indent:0.5in')).toBe(48)
    expect(firstLineIndentPx('margin-left:24px')).toBe(0)
    expect(firstLineIndentPx('text-indent:-18px')).toBe(-18)
  })

  it('clears only the first-line indent', () => {
    expect(withoutFirstLineIndent('font-size:11pt; text-indent:48.0px; margin-left:24px')).toBe('font-size:11pt; text-indent:0; margin-left:24px')
    expect(withoutFirstLineIndent('text-indent:1in')).toBe('text-indent:0')
  })
})
