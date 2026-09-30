/**
 * Pure text extraction helpers for Drive imports. No I/O, so each function is
 * directly unit-testable without a Drive connection or a temp file.
 */

/** Strip RTF control words and convert backslash-escaped text into paragraphs. */
export function rtfToParagraphs(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  return raw
    .replace(/\\u-?\d+\s?/g, (m: string): string => {
      // RTF `\uN` is a DECIMAL code point, not hex. Reading it as hex
      // (\u9731) decoded to CJK instead of the intended snowman, corrupting
      // every non-ASCII character in an imported RTF file.
      const num = Number(m.replace(/\\u/, '').trim())
      return num >= 32 && num <= 0x10ffff ? String.fromCodePoint(num).replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim() : ''
    })
    .replace(/'[0-9a-fA-F]{2}/g, (m: string): string => String.fromCharCode(parseInt(m.slice(1), 16)))
    .replace(/\\\w+-?\d* ?/g, ' ') // strip control words like \par \b \i \cf2
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\\\/g, '\\')
    .split(/[\r\n]/)
    .map((line: string) => line.replace(/\s+/g, ' ').trim())
    .filter((line: string) => line.length > 0)
    .map((line: string) => `<p>${escapeHtml(line)}</p>`)
    .join('\n')
}

/** Wrap plain-text lines in escaped HTML paragraphs, dropping blank lines. */
export function textToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line: string) => line.trim().length > 0)
    .map((line: string) => `<p>${escapeHtml(line)}</p>`)
    .join('\n')
}

/** Escape the three characters that would otherwise inject markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
