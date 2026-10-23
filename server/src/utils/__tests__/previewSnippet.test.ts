import { extractPreviewSnippet } from '../previewSnippet'

describe('extractPreviewSnippet', () => {
  it('keeps safe inline styles and drops unsafe ones', () => {
    const out = extractPreviewSnippet('<p style="text-align:center; font-family:Georgia; background:url(x); position:fixed">Hi</p>')
    expect(out).toContain('text-align: center')
    expect(out).toContain('font-family: Georgia')
    expect(out).not.toContain('url(')
    expect(out).not.toContain('position')
  })

  it('keeps spans and tables but drops scripts, classes and handlers', () => {
    const out = extractPreviewSnippet('<script>x()</script><table class="a" onclick="x()"><tr><td colspan="2"><span style="font-weight:700">A</span></td></tr></table>')
    expect(out).toBe('<table><tr><td colspan="2"><span style="font-weight: 700">A</span></td></tr></table>')
  })

  it('stops at the first page break', () => {
    const out = extractPreviewSnippet('<p>One</p><div class="intellidocs-page-break"></div><p>Two</p>')
    expect(out).toBe('<p>One</p>')
  })

  it('replaces embedded images with a grey box and keeps linked images', () => {
    const out = extractPreviewSnippet('<img src="data:image/png;base64,AAAA" width="100" height="50"><img src="https://x.test/a.png">')
    expect(out).toContain('background-color: #e5e7eb')
    expect(out).toContain('width: 100px')
    expect(out).toContain('<img src="https://x.test/a.png">')
    expect(out).not.toContain('base64')
  })

  it('never leaves a half-written tag when it truncates', () => {
    const out = extractPreviewSnippet(`<p>${'a'.repeat(30000)}</p>`)
    expect(out.length).toBeLessThanOrEqual(24000)
  })
})
