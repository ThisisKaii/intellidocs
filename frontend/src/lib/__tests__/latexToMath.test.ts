import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { latexToMath } from '../latexToMath'

type Docx = typeof import('docx')

/** The word/document.xml of a one-paragraph document holding the equation, or null when it is unsupported. */
async function equationXml(latex: string): Promise<string | null> {
  const D: Docx = await import('docx')
  const parts = latexToMath(D, latex)
  if (!parts) return null
  const doc = new D.Document({ sections: [{ children: [new D.Paragraph({ children: [new D.Math({ children: parts })] })] }] })
  const zip = await JSZip.loadAsync(await D.Packer.toBuffer(doc))
  return zip.file('word/document.xml')!.async('string')
}

describe('latexToMath', () => {
  it('writes a fraction', async () => {
    const xml = await equationXml('\\frac{1}{2}')
    expect(xml).toContain('<m:f>')
    expect(xml).toContain('<m:num>')
    expect(xml).toContain('<m:den>')
  })

  it('writes superscripts, subscripts and both', async () => {
    expect(await equationXml('x^{2}')).toContain('<m:sSup>')
    expect(await equationXml('x_{i}')).toContain('<m:sSub>')
    expect(await equationXml('x_{i}^{2}')).toContain('<m:sSubSup>')
  })

  it('writes pre-scripts', async () => {
    expect(await equationXml('{}_{1}^{2}X')).toContain('<m:sPre>')
  })

  it('writes roots with and without a degree', async () => {
    expect(await equationXml('\\sqrt{x}')).toContain('<m:rad>')
    expect(await equationXml('\\sqrt[3]{x}')).toContain('<m:deg>')
  })

  it('writes sums and integrals with their limits and operand', async () => {
    const sum = await equationXml('\\sum_{i=1}^{n} x')
    expect(sum).toContain('<m:nary>')
    expect(sum).toContain('∑')
    expect(sum).toContain('<m:sub>')
    expect(sum).toContain('<m:sup>')
    // An integral is Word's default n-ary operator, so it is written without an operator character.
    const plain = await equationXml('\\int f')
    expect(plain).toContain('<m:nary>')
    expect(plain).not.toContain('∑')
    const limited = await equationXml('\\int_{0}^{1} f')
    expect(limited).toContain('<m:nary>')
    expect(limited).toContain('<m:sub>')
    expect(limited).not.toContain('<m:subHide m:val="1"/>')
  })

  it('writes bracket pairs', async () => {
    expect(await equationXml('\\left( x \\right)')).toContain('<m:d>')
    expect(await equationXml('\\left\\langle a \\right\\rangle')).toContain('<m:d>')
  })

  it('writes symbols and text as characters', async () => {
    const xml = await equationXml('\\alpha \\leq \\beta \\text{ if } x')
    expect(xml).toContain('α')
    expect(xml).toContain('≤')
    expect(xml).toContain('β')
    expect(xml).toContain(' if ')
  })

  it('keeps a whole equation together: E=mc^{2} is one run, a power and the rest', async () => {
    const xml = await equationXml('E=mc^{2}')
    expect(xml).toContain('E=m')
    expect(xml).toContain('<m:sSup>')
  })

  it('reports what Word cannot take from here instead of guessing', () => {
    return Promise.all(
      ['\\begin{aligned}a&=b\\end{aligned}', '\\widehat{x}', '\\overline{x}', '\\frac{1}', 'a & b', '{unclosed'].map(async (latex) => {
        expect(await equationXml(latex), latex).toBeNull()
      }),
    )
  })
})
