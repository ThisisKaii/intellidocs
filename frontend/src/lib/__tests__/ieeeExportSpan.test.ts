import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { buildIeeeDocxBlob } from '../ieeeExport'

async function documentXml(html: string): Promise<string> {
  const blob = await buildIeeeDocxBlob(html, 'Span')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

const FRONT = '<h1 data-doc-role="title">Title</h1><p>Author</p><p><strong><em>Abstract</em></strong>—text.</p>'

/** The text of each section: section properties close a section, so the text before the n-th one belongs to it. */
function sectionTexts(xml: string): string[] {
  return xml.split('<w:sectPr').map((part) => part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
}

describe('IEEE export of full-width blocks', () => {
  it('puts a marked table and its caption in a single-column section between two-column sections', async () => {
    const xml = await documentXml(
      `${FRONT}<h1>I. Intro</h1><p>Before the table.</p>` +
        '<p data-caption-kind="table">TABLE I. Wide results</p>' +
        '<table data-span="full"><tr><td><p>cell</p></td></tr></table>' +
        '<p>After the table.</p>',
    )
    expect((xml.match(/<w:sectPr/g) ?? []).length).toBe(4)
    const texts = sectionTexts(xml)
    expect(texts[1]).toContain('Before the table.')
    expect(texts[1]).not.toContain('TABLE I.')
    expect(texts[2]).toContain('TABLE I. Wide results')
    expect(texts[2]).toContain('cell')
    expect(texts[3]).toContain('After the table.')
    // Two-column sections: the body before and after; the full-width run has no columns.
    expect((xml.match(/<w:cols [^>]*w:num="2"/g) ?? []).length).toBe(2)
    expect((xml.match(/w:type w:val="continuous"/g) ?? []).length).toBe(3)
  })

  it('keeps one two-column body section when nothing is marked', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><p>Text.</p><table><tr><td><p>cell</p></td></tr></table>`)
    expect((xml.match(/<w:sectPr/g) ?? []).length).toBe(2)
  })

  it('runs a marked display equation across both columns', async () => {
    const xml = await documentXml(`${FRONT}<h1>I. Intro</h1><p>Before.</p><div data-type="block-math" data-latex="a^{2}" data-span="full"></div><p>After.</p>`)
    expect((xml.match(/<w:sectPr/g) ?? []).length).toBe(4)
    expect(sectionTexts(xml)[2]).toContain('a')
  })
})
