import { describe, expect, it } from 'vitest'
import { decidePushes, type FlowBlock, type PageGrid } from './pageFlow'

// Letter page, 1in margins, 40px gap: page 2 starts at y = 1096.
const grid: PageGrid = { pitch: 1096, pageHeight: 1056, marginTop: 96, marginBottom: 96 }
const L = 20

/** A paragraph whose lines start at the given tops. */
const paragraph = (...tops: number[]): FlowBlock => ({ kind: 'paragraph', lineTops: tops, lineHeight: L })
const heading = (top: number): FlowBlock => ({ kind: 'heading', lineTops: [top], lineHeight: L })

describe('decidePushes', () => {
  it('moves a paragraph whose first line is alone at the bottom of a page (orphan)', () => {
    // Page 1 text area ends at y = 960; the first line sits at 940, the rest on page 2.
    const pushes = decidePushes(grid, [paragraph(940, 1192, 1212, 1232)])
    expect(pushes).toEqual([{ block: 0, line: 0, height: 1192 - 940, reason: 'orphan' }])
  })

  it('moves the line before a lone last line (widow)', () => {
    const pushes = decidePushes(grid, [paragraph(900, 920, 940, 1192)])
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({ block: 0, line: 2, reason: 'widow' })
  })

  it('leaves a paragraph that splits cleanly alone', () => {
    expect(decidePushes(grid, [paragraph(880, 900, 920, 940, 1192, 1212)])).toEqual([])
  })

  it('moves a heading that ends a page with its text on the next', () => {
    const pushes = decidePushes(grid, [heading(940), paragraph(1192, 1212, 1232)])
    expect(pushes).toEqual([{ block: 0, line: 0, height: 1192 - 940, reason: 'keep-with-next' }])
  })

  it('does not push a block that already starts a page', () => {
    expect(decidePushes(grid, [paragraph(1192, 1212, 1232)])).toEqual([])
  })
})
