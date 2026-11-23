import { describe, expect, it } from 'vitest'
import { expandBoxShorthand, filterStyle } from './TiptapEditor'

describe('filterStyle', () => {
  it('keeps a saved margin shorthand as its longhands', () => {
    const saved = 'margin: 8.4px 23.7px 0px 24px; text-align: justify; font-size: 11pt; text-indent: 48px'
    expect(filterStyle(saved)).toBe(
      'margin-top: 8.4px; margin-right: 23.7px; margin-bottom: 0px; margin-left: 24px; text-align: justify; font-size: 11pt; text-indent: 48px',
    )
  })

  it('expands one to four values the CSS way', () => {
    expect(expandBoxShorthand('margin', '6pt')).toEqual(['margin-top: 6pt', 'margin-right: 6pt', 'margin-bottom: 6pt', 'margin-left: 6pt'])
    expect(expandBoxShorthand('padding', '1px 2px')).toEqual(['padding-top: 1px', 'padding-right: 2px', 'padding-bottom: 1px', 'padding-left: 2px'])
    expect(expandBoxShorthand('margin', '1px 2px 3px')).toEqual(['margin-top: 1px', 'margin-right: 2px', 'margin-bottom: 3px', 'margin-left: 2px'])
    expect(expandBoxShorthand('margin', 'calc(1px + 2px)')).toBeNull()
  })

  it('still drops properties outside the whitelist', () => {
    expect(filterStyle('position: absolute; color: red')).toBe('color: red')
  })
})
