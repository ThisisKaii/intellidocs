import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import JSZip from 'jszip'

import { buildIeeeDocxBlob } from '../ieeeExport'

const SAMPLE_HTML = `
<h1 data-doc-role="title">Deep Learning for Slide Recognition</h1>
<p>Ada Lovelace</p>
<p>Analytical University, London, UK</p>
<p><strong><em>Abstract</em></strong>—We present a method for recognising slides.</p>
<p><strong><em>Index Terms</em></strong>—recognition, slides, learning.</p>
<h1>I. Introduction</h1>
<p>Slides are everywhere [1]. This body text should be justified in two columns.</p>
<h2>A. Problem Statement</h2>
<p>We state the problem.</p>
<h3>1) Background:</h3>
<p>Prior art.</p>
<p data-caption-kind="figure">Figure 1. A caption written by the author.</p>
<h1>References</h1>
<p>[1] A. Author, "A title," Journal, vol. 1, 2020.</p>
`

/** Unzips a generated docx Blob and returns word/document.xml. */
async function documentXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

describe('buildIeeeDocxBlob', () => {
  it('writes Letter page, IEEE margins and a continuous two-column section', async () => {
    const blob = await buildIeeeDocxBlob(SAMPLE_HTML, 'Sample')
    const xml = await documentXml(blob)

    expect(xml).toContain('w:w="12240"')
    expect(xml).toContain('w:top="1080"')
    expect(xml).toContain('w:bottom="1440"')
    expect(xml).toContain('w:left="900"')
    expect(xml).toContain('w:right="900"')
    expect(xml).toContain('w:type w:val="continuous"')
    expect(xml).toMatch(/<w:cols [^>]*w:num="2"/)
    expect(xml).toMatch(/<w:cols [^>]*w:space="360"/)
    expect(xml).toContain('I. Introduction')
    expect(xml).toContain('1) Background:')
    expect(xml).toContain('Figure 1. A caption written by the author.')

    const out = process.env.IEEE_SAMPLE_OUT
    if (out) writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
  })
})
