export interface DiffToken {
  text: string
  type: 'same' | 'add' | 'del'
}

/** Split HTML into word tokens, ignoring tags. */
function tokenize(html: string): string[] {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Longest-common-subsequence diff between two html strings at word granularity. */
export function diffWords(originalHtml: string, revisedHtml: string): DiffToken[] {
  const a = tokenize(originalHtml)
  const b = tokenize(revisedHtml)

  const n = a.length
  const m = b.length
  const table: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const out: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ text: a[i], type: 'same' })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ text: a[i], type: 'del' })
      i++
    } else {
      out.push({ text: b[j], type: 'add' })
      j++
    }
  }
  while (i < n) out.push({ text: a[i++], type: 'del' })
  while (j < m) out.push({ text: b[j++], type: 'add' })
  return out
}