import { describe, expect, it } from 'vitest'
import { columnsForWidth, hiddenCount, MAX_GRID_WIDTH, ROWS_PER_PAGE, visibleLimit } from './paging'

describe('columnsForWidth', () => {
  it('fits as many 200px cards (16px gap) as the width allows', () => {
    expect(columnsForWidth(200)).toBe(1)
    expect(columnsForWidth(415)).toBe(1) // 2 cards need 200 + 16 + 200 = 416
    expect(columnsForWidth(416)).toBe(2)
    expect(columnsForWidth(686)).toBe(3) // tablet
    expect(columnsForWidth(1574)).toBe(7) // 1080p content area
    expect(columnsForWidth(3000)).toBe(7)
  })

  it('caps the grid one pixel short of an eighth track', () => {
    expect(columnsForWidth(MAX_GRID_WIDTH)).toBe(7)
    expect(Math.floor((MAX_GRID_WIDTH + 16) / 216)).toBe(7)
    expect(Math.floor((MAX_GRID_WIDTH + 1 + 16) / 216)).toBe(8)
  })

  it('never returns less than one column, even before the width is measured', () => {
    expect(columnsForWidth(0)).toBe(1)
    expect(columnsForWidth(80)).toBe(1)
    expect(columnsForWidth(Number.NaN)).toBe(1)
  })
})

describe('visibleLimit and hiddenCount', () => {
  it('shows three rows first and three more on each step', () => {
    expect(ROWS_PER_PAGE).toBe(3)
    expect(visibleLimit(3, 4)).toBe(12)
    expect(visibleLimit(6, 4)).toBe(24)
  })

  it('reports how many documents are still hidden', () => {
    expect(hiddenCount(30, 3, 4)).toBe(18)
    expect(hiddenCount(30, 6, 4)).toBe(6)
    expect(hiddenCount(30, 9, 4)).toBe(0)
    expect(hiddenCount(5, 3, 4)).toBe(0)
  })
})
