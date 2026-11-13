/** Rows of documents shown first, and added by each "Show more". */
export const ROWS_PER_PAGE = 3

/** Maximum columns the document grid will show per row. */
export const MAX_COLUMNS = 6

/** Narrowest a grid card may get (matches `minmax(232px, 1fr)` in the document grid) and the gap between cards. */
export const MIN_CARD_WIDTH = 232
export const CARD_GAP = 16

/**
 * Widest the document grid may be while CSS `auto-fill` still makes at most {@link MAX_COLUMNS}
 * tracks: one pixel short of room for one more card. Keeps the paging count and the grid in step.
 */
export const MAX_GRID_WIDTH = (MAX_COLUMNS + 1) * (MIN_CARD_WIDTH + CARD_GAP) - CARD_GAP - 1

/**
 * How many cards fit in one row of the auto-fill grid at this container width.
 * Returns at least 1, at most {@link MAX_COLUMNS}.  On smaller windows fewer
 * columns are returned so the layout stays responsive.
 */
export function columnsForWidth(width: number, minCard: number = MIN_CARD_WIDTH, gap: number = CARD_GAP): number {
  if (!(width > 0)) return 1
  return Math.min(Math.max(1, Math.floor((width + gap) / (minCard + gap))), MAX_COLUMNS)
}

/** How many items fill the given number of rows. */
export function visibleLimit(rows: number, columns: number): number {
  return Math.max(1, rows) * Math.max(1, columns)
}

/** How many items are still hidden after showing the given rows. */
export function hiddenCount(total: number, rows: number, columns: number): number {
  return Math.max(0, total - visibleLimit(rows, columns))
}
