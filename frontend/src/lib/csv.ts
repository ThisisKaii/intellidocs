/** A value that can sit in one CSV cell. */
export type CsvCell = string | number | boolean | null | undefined

/** One column of a CSV table: which field to read and the heading to print. */
export interface CsvColumn<Row> {
  key: keyof Row & string
  label: string
}

/**
 * Quote one cell for CSV: wrap it in quotes when it holds a comma, quote or
 * line break (doubling inner quotes), and prefix a cell a spreadsheet would run
 * as a formula (=, +, -, @) with an apostrophe so it stays plain text.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Turn rows into CSV text with a heading line (CRLF line breaks, as Excel expects). */
export function toCsv<Row extends Record<string, CsvCell>>(rows: Row[], columns: Array<CsvColumn<Row>>): string {
  const header = columns.map((column) => csvCell(column.label)).join(',')
  const lines = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','))
  return [header, ...lines].join('\r\n')
}

/** Save text as a file through the browser (a Blob link, so nothing is sent anywhere). */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  // The BOM makes Excel read UTF-8 names correctly.
  const blob = new Blob(['﻿', text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
