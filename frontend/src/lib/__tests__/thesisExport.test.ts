import { describe, expect, it, vi } from 'vitest'
import { buildDocumentPdfHtml, exportDocumentPdf, exportThesisPdf } from '../thesisExport'

describe('PDF export HTML builder', () => {
  it('suppresses browser print headers/footers with @page margin 0 while preserving repeatable margins', () => {
    const html = buildDocumentPdfHtml(
      '<p>Title page</p><div class="intellidocs-page-break"></div><p>Chapter I</p>',
      'IntelliDocs Real',
      {
        pageSize: 'letter',
        orientation: 'portrait',
        margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
      }
    )

    expect(html).toContain('size: 8.5000in 11.0000in;')
    expect(html).toContain('margin: 0;')
    expect(html).toContain('height: 1in;')
    expect(html).toContain('padding: 0 1in 0 1.5in;')
    expect(html).toContain('page-break-after: always;')
  })

  it('scopes academic preset CSS to the print wrapper', () => {
    const html = buildDocumentPdfHtml('<p>Body</p>', 'Paper', {
      presetCss: '.intellidocs-page-editor .ProseMirror p { text-align: justify; }',
    })
    expect(html).toContain('.intellidocs-print-doc p { text-align: justify; }')
    expect(html).not.toContain('.intellidocs-page-editor')
  })

  it('never calls window.open (no new tab) and uses a hidden iframe', () => {
    const openSpy = vi.spyOn(window, 'open')
    exportDocumentPdf('<p>Hello</p>', 'Test')
    exportThesisPdf('<p>Thesis</p>', 'Thesis')
    expect(openSpy).not.toHaveBeenCalled()
    expect(document.getElementById('intellidocs-pdf-print-frame')).not.toBeNull()
    openSpy.mockRestore()
  })
})
