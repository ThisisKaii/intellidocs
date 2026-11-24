/**
 * Column widths of a table pasted from somewhere else (Word, Google Docs, a web page), as the
 * percent list the editor's grid tables keep in `columnSize` ("18,20,32,10,10,10").
 *
 * The editor only read its own `data-column-size`, so every pasted table came out with equal
 * columns: a narrow "Sub Module" column wrapped every name onto three lines. Word and Docs write the
 * widths on `<col>` elements or on the first row's cells instead; this reads them from there.
 * An empty string (equal columns) when the widths are missing, mixed or do not cover every column.
 */
export function columnSizeFromTable(table: HTMLElement): string {
  const columns = gridColumnCount(table)
  if (columns === 0) return ''
  const fromCols = Array.from(table.querySelectorAll(':scope > colgroup > col, :scope > col')).flatMap((col) => {
    const span = Math.max(1, Number(col.getAttribute('span')) || 1)
    return Array.from({ length: span }, () => widthOf(col as HTMLElement))
  })
  const widths = fromCols.length === columns ? fromCols : firstRowWidths(table, columns)
  if (!widths || widths.length !== columns || widths.some((w) => w === null)) return ''
  const values = widths as Array<{ value: number; unit: string }>
  if (new Set(values.map((w) => w.unit)).size !== 1) return ''
  const total = values.reduce((sum, w) => sum + w.value, 0)
  if (total <= 0) return ''
  return values.map((w) => `${Math.round((w.value / total) * 10000) / 100}`).join(',')
}

/** The table's column count: the widest row, counting colspans. */
function gridColumnCount(table: HTMLElement): number {
  let widest = 0
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    if (row.closest('table') !== table) continue
    let count = 0
    for (const cell of Array.from(row.children)) {
      if (cell.tagName === 'TD' || cell.tagName === 'TH') count += Math.max(1, Number(cell.getAttribute('colspan')) || 1)
    }
    widest = Math.max(widest, count)
  }
  return widest
}

/** Widths of the first row whose cells span one column each and give a width. */
function firstRowWidths(table: HTMLElement, columns: number): Array<{ value: number; unit: string } | null> | null {
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    if (row.closest('table') !== table) continue
    const cells = Array.from(row.children).filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH') as HTMLElement[]
    if (cells.length !== columns || cells.some((cell) => (Number(cell.getAttribute('colspan')) || 1) > 1)) continue
    const widths = cells.map(widthOf)
    if (widths.every((w) => w !== null)) return widths
  }
  return null
}

/** A width from `style="width: …"` or the `width` attribute: percent, px or pt. */
function widthOf(element: HTMLElement): { value: number; unit: string } | null {
  const raw = element.style.width || element.getAttribute('width') || ''
  const match = /^\s*([\d.]+)\s*(%|px|pt)?\s*$/.exec(raw)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = match[2] ?? 'px'
  // pt and px measure the same kind of length; keep one unit so a mixed list still compares.
  return unit === 'pt' ? { value: (value * 4) / 3, unit: 'px' } : { value, unit }
}
