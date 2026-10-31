import { describe, expect, it } from 'vitest'
import { sanitizePreviewHtml } from '../DocumentPreview'

describe('dashboard preview of equations', () => {
  it('shows an equation as its LaTeX source instead of leaving a gap', () => {
    const html =
      '<p>Area <span data-type="inline-math" data-latex="x^{2}"></span> here</p>' +
      '<div data-type="block-math" data-latex="E=mc^{2}" data-number="1"></div>'
    const preview = sanitizePreviewHtml(html)
    expect(preview).toContain('x^{2}')
    expect(preview).toContain('E=mc^{2}')
    expect(preview).not.toContain('data-latex')
  })
})
