import { describe, expect, it } from 'vitest'
import { columnsForWidth, hiddenCount, ROWS_PER_PAGE, visibleLimit } from './paging'

describe('columnsForWidth', () => {
  it('fits as many 220px cards (16px gap) as the width allows', () => {
    expect(columnsForWidth(220)).toBe(1)
    expect(columnsForWidth(472)).toBe(2) // 220 + 16 + 220 = 456 fits, 3 cards need 692
    expect(columnsForWidth(692)).toBe(3)
    expect(columnsForWidth(1200)).toBe(5)
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
