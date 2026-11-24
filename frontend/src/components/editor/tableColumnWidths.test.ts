import { describe, expect, it } from 'vitest'
import { columnSizeFromTable } from './tableColumnWidths'

function table(html: string): HTMLElement {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return holder.querySelector('table') as HTMLElement
}

describe('columnSizeFromTable', () => {
  it('reads percent widths from <col> elements', () => {
    const t = table('<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tr><td>a</td><td>b</td></tr></table>')
    expect(columnSizeFromTable(t)).toBe('25,75')
  })

  it("reads Word's cell widths from the first row when there are no <col>s", () => {
    const t = table('<table><tr><td width="100">a</td><td width="300">b</td></tr></table>')
    expect(columnSizeFromTable(t)).toBe('25,75')
  })

  it('gives up (equal columns) when widths are missing or do not cover every column', () => {
    expect(columnSizeFromTable(table('<table><tr><td>a</td><td>b</td></tr></table>'))).toBe('')
    expect(columnSizeFromTable(table('<table><colgroup><col style="width:50%"></colgroup><tr><td>a</td><td>b</td></tr></table>'))).toBe('')
  })
})
