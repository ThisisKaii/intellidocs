import { describe, expect, it } from 'vitest'
import { withoutLayoutIndents } from '../chatFormatting'

describe('withoutLayoutIndents', () => {
  it("drops a Word file's side indents and keeps the rest", () => {
    expect(withoutLayoutIndents('margin: 8.5px 27.8px 0px 24px; font-size: 11pt; text-indent: 0.5in', false)).toBe(
      'margin-top: 8.5px; margin-bottom: 0px; font-size: 11pt; text-indent: 0.5in',
    )
  })

  it("also drops a heading's first-line indent", () => {
    expect(withoutLayoutIndents('margin-left: 24px; font-weight: bold; text-indent: 24px', true)).toBe('font-weight: bold')
  })

  it('keeps a deliberate block indent such as a quotation', () => {
    expect(withoutLayoutIndents('margin-left: 1in; margin-right: 1in', false)).toBe('margin-left: 1in; margin-right: 1in')
  })
})
