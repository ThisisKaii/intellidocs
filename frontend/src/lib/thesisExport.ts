/**
 * Defense-ready export engine (plan point 26).
 *
 * Produces a Word-compatible document that enforces UCLM hardbound thesis
 * layout: 1.5-inch left binding margin, 1.0-inch top/right/bottom margins,
 * 2.0 double spacing in body text, lowercase Roman numerals for preliminary
 * pages and Arabic numerals for the body (restarted at 1).
 *
 * Export targets:
 *  - Word (.doc): self-contained mso-HTML Word honors via styles + field codes
 *  - PDF: a dedicated print layout opened in the browser's Save-as-PDF dialog
 */

const BODY_MARGIN_IN = '1.0in'
const BINDING_LEFT_IN = '1.5in'

/** Escape text destined for HTML output. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Build the shared Word page-setup stylesheet (mso-supported selectors). */
function wordPageSetupCss(): string {
  return `
    @page WordSectionPre { size: 8.5in 11.0in; mso-page-orientation: portrait;
      margin: ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BINDING_LEFT_IN};
      mso-header-margin: .5in; mso-footer-margin: .5in; mso-paper-source: 0; }
    @page WordSectionBody { size: 8.5in 11.0in; mso-page-orientation: portrait;
      margin: ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BINDING_LEFT_IN};
      mso-header-margin: .5in; mso-footer-margin: .5in; mso-paper-source: 0; }
    div.WordSectionPre { page: WordSectionPre; }
    div.WordSectionBody { page: WordSectionBody; }`
}

/** Word page-number field code; `{ PAGE \* roman }` or `{ PAGE \* arabic }`. */
function pageNumberField(numberFormat: 'roman-lower' | 'arabic', restartAt?: number): string {
  const numeric = numberFormat === 'roman-lower' ? 'roman' : 'arabic'
  const restart = restartAt ? '<w:pgNumType w:start="1"/>' : ''
  return `<span style="mso-element:footer">
    <span style="mso-field-code:'PAGE  \\* ${numeric}'">{ PAGE \\* ${numeric} }</span>
  </span>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" />${restart}</w:sectPr>`
}

/** Produce the self-contained Word (.doc) HTML for the thesis layout. */
export function buildThesisWordHtml(html: string, title: string): string {
  const safeTitle = esc(title.trim() || 'Untitled Document')
  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<meta name=ProgId content=Word.Document>
<title>${safeTitle}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
  /* Sections: Preliminary (lowercase Roman) vs Body (Arabic) */
  ${wordPageSetupCss()}

  body { font-family: 'Times New Roman', serif; font-size: 12pt;
         line-height: 200%; color: #000; }
  p { margin: 0 0 0.25in; line-height: 200%; }
  h1 { font-size: 16pt; font-weight: bold; line-height: 200%; margin: 0.4in 0 0.25in; }
  h2 { font-size: 14pt; font-weight: bold; line-height: 200%; margin: 0.35in 0 0.2in; }
  h3 { font-size: 12pt; font-weight: bold; line-height: 200%; margin: 0.3in 0 0.15in; }
  blockquote { margin: 0.25in 0.5in; font-style: italic; line-height: 200%; }
  table { border-collapse: collapse; width: 100%; line-height: 200%; }
  th, td { border: 1px solid #444; padding: 4pt; vertical-align: top; }
  p { text-align: justify; }
</style>
</head>
<body>

<!-- Preliminaries: roman i, ii, iii... -->
<div class="WordSectionPre">
  <div style="text-align:center">
    <p style="font-size:16pt; font-weight:bold">${safeTitle}</p>
    <p>An Undergraduate Thesis Presented to the Faculty of the University of Cebu Lapu-Lapu and Mandaue</p>
  </div>
  ${pageNumberField('roman-lower')}
</div>

<!-- Body: arabic starting at 1 -->
<div class="WordSectionBody">
  ${html}
  ${pageNumberField('arabic', 1)}
</div>

</body>
</html>`
}

/** Generate the headless print page used by the "Export as PDF" flow. */
export function buildThesisPdfHtml(html: string, title: string): string {
  const safeTitle = esc(title.trim() || 'Untitled Document')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset='utf-8'>
<title>${safeTitle}</title>
<style>
  @page {
    size: letter;
    margin: ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BODY_MARGIN_IN} ${BINDING_LEFT_IN};
  }
  html, body {
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 200%;
    color: #000;
    background: #fff;
  }
  body { margin: 0; padding: 0; }
  p { margin: 0 0 0.18in; text-align: justify; line-height: 200%; }
  h1 { font-size: 15pt; font-weight: bold; margin: 0.35in 0 0.2in; }
  h2 { font-size: 13pt; font-weight: bold; margin: 0.3in 0 0.15in; }
  h3 { font-size: 12pt; font-weight: bold; margin: 0.25in 0 0.12in; }
  blockquote { margin: 0.2in 0.4in; font-style: italic; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #444; padding: 4pt; vertical-align: top; }
</style>
</head>
<body>
  ${html}
</body>
</html>`
}

/** Convert ANY string to a Blob URL and trigger a client-side download. */
function downloadBlob(content: string, fileName: string, mime: string): void {
  const blob = new Blob(['\ufeff', content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

/** One-click Word export with the defense-ready layout. */
export function exportThesisWord(html: string, title: string): void {
  const fileTitle = (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '')
  downloadBlob(
    buildThesisWordHtml(html, title),
    `${fileTitle} Thesis (Defense-Ready).doc`,
    'application/msword;charset=utf-8'
  )
}

/** One-click PDF export: opens the browser print dialog preconfigured for PDF. */
export function exportThesisPdf(html: string, title: string): void {
  const win = window.open('', '_blank', 'noopener')
  if (!win) {
    // Pop-up blocked: fall back to a temporary iframe over the current page.
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (doc) {
      doc.open()
      doc.write(buildThesisPdfHtml(html, title))
      doc.close()
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }
    return
  }
  win.document.open()
  win.document.write(buildThesisPdfHtml(html, title))
  win.document.close()
  win.focus()
  win.print()
}