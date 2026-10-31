import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { buildIeeeDocxBlob } from '../ieeeExport'

async function documentXml(html: string): Promise<string> {
  const blob = await buildIeeeDocxBlob(html, 'Math')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

const FRONT = '<h1 data-doc-role="title">Title</h1><p>Author</p><p><strong><em>Abstract</em></strong>—text.</p>'

describe('IEEE export of equations', () => {
  it('writes an inline equation as a Word equation inside its sentence', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><p>Where <span data-type="inline-math" data-latex="s=\\frac{n}{N}"></span> is the score.</p>`)
    expect(xml).toContain('<m:oMath>')
    expect(xml).toContain('<m:f>')
    expect(xml).toContain('Where ')
    expect(xml).toContain(' is the score.')
  })

  it('writes a numbered display equation with the number at the right tab', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><div data-type="block-math" data-latex="E=mc^{2}" data-number="1"></div>`)
    expect(xml).toContain('<m:oMath>')
    expect(xml).toContain('<m:sSup>')
    expect(xml).toContain('(1)')
    expect(xml).toContain('w:val="right"')
    expect(xml).toContain('w:val="center"')
    expect(xml).toMatch(/<w:tab\/>/)
  })

  it('centres an unnumbered display equation', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><div data-type="block-math" data-latex="a^{2}+b^{2}=c^{2}"></div>`)
    expect(xml).toContain('<m:oMath>')
    expect(xml).toContain('w:val="center"')
  })

  it('writes the LaTeX as visible text when an equation uses something Word cannot take', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><div data-type="block-math" data-latex="\\widehat{x}+1"></div>`)
    expect(xml).toContain('\\widehat{x}+1')
    expect(xml).not.toContain('<m:oMath>')
  })

  it('does not leave an equation out when it sits inside a table cell', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><table><tr><td><span data-type="inline-math" data-latex="x^{2}"></span></td></tr></table>`)
    expect(xml).toContain('<m:sSup>')
  })
})
