import { describe, expect, it } from 'vitest'
import { firstLineStart } from './TiptapEditor'

describe('firstLineStart', () => {
  it('adds the left margin and the first-line indent', () => {
    expect(firstLineStart('font-size:11pt; margin-left:89.7px; text-indent:0px;')).toBe(89.7)
    expect(firstLineStart('margin-left:48px; text-indent:-24px')).toBe(24)
  })

  it('reads the left value of the margin shorthand', () => {
    expect(firstLineStart('margin: 0px 233.1px 0px 244.3px; text-indent: 57.1px')).toBe(301.4)
    expect(firstLineStart('margin: 8.5px 23.9px 0px 24px; text-indent: 48px')).toBe(72)
    expect(firstLineStart('margin: 0 12px')).toBe(12)
  })

  it('converts other units and ignores what it cannot read', () => {
    expect(firstLineStart('margin-left:0.5in')).toBe(48)
    expect(firstLineStart('margin-left:12pt')).toBe(16)
    expect(firstLineStart('margin-left:auto; text-indent:2em')).toBe(0)
    expect(firstLineStart('')).toBe(0)
  })
})
