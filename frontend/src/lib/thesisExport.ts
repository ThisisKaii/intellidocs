import {
  PAGE_SIZES,
  type MarginValues,
  type PageOrientation,
  type PageSizeKey,
} from '@/components/editor/HeaderFooterPlugin'

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
  const restart = restartAt ? `<w:pgNumType w:start="${Math.max(1, Math.round(restartAt))}"/>` : ''
  return `<span style="mso-element:footer">
    <span style="mso-field-code:'PAGE  \\* ${numeric}'">{ PAGE \\* ${numeric} }</span>
  </span>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" />${restart}</w:sectPr>`
}

/** Produce the self-contained Word (.doc) HTML for the thesis layout. */
/**
 * `bodyStart`: the number the body's first page shows (a chapter exported on its own keeps its
 * page numbers from the whole document; 1 by default).
 */
export function buildThesisWordHtml(html: string, title: string, options: { bodyStart?: number } = {}): string {
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
  ${pageNumberField('arabic', options.bodyStart ?? 1)}
</div>

</body>
</html>`
}

export interface PdfExportOptions {
  pageSize?: PageSizeKey
  margins?: MarginValues
  orientation?: PageOrientation
  presetCss?: string
}

const DEFAULT_PDF_MARGINS: MarginValues = { top: 1, bottom: 1, left: 1, right: 1 }

/** Scope editor-only preset selectors to the print document wrapper. */
function scopePresetCssForPrint(presetCss?: string): string {
  if (!presetCss) return ''
  return presetCss
    .replace(/\.intellidocs-page-editor\s+\.ProseMirror/g, '.intellidocs-print-doc')
    .replace(/\.ProseMirror\.rm-with-pagination/g, '.intellidocs-print-doc')
    .replace(/\.ProseMirror/g, '.intellidocs-print-doc')
}

/**
 * Build a clean self-contained print page that mirrors the document's exact
 * page size, orientation, and margins on every page while keeping `@page { margin: 0 }`
 * so Chromium does not inject browser date/title/URL/page-count headers or footers.
 */
export function buildDocumentPdfHtml(
  html: string,
  title: string,
  options: PdfExportOptions = {}
): string {
  const safeTitle = esc(title.trim() || 'Untitled Document')
  const baseSize = PAGE_SIZES[options.pageSize ?? 'short'] ?? PAGE_SIZES.short
  const isLandscape = options.orientation === 'landscape'
  const widthIn = (isLandscape ? baseSize.height : baseSize.width) / 96
  const heightIn = (isLandscape ? baseSize.width : baseSize.height) / 96
  const margins = options.margins ?? DEFAULT_PDF_MARGINS
  const scopedPreset = scopePresetCssForPrint(options.presetCss)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page {
    size: ${widthIn.toFixed(4)}in ${heightIn.toFixed(4)}in;
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.intellidocs-print-sheet {
    width: 100%;
    border-collapse: collapse;
    border: 0;
    table-layout: fixed;
  }
  table.intellidocs-print-sheet > thead > tr > td,
  table.intellidocs-print-sheet > tfoot > tr > td {
    border: 0;
    padding: 0;
    margin: 0;
  }
  table.intellidocs-print-sheet > tbody > tr > td {
    border: 0;
    padding: 0 ${margins.right}in 0 ${margins.left}in;
    vertical-align: top;
  }
  .intellidocs-print-doc {
    width: 100%;
    box-sizing: border-box;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .intellidocs-print-doc p { margin: 0 0 0.08in; }
  .intellidocs-print-doc h1,
  .intellidocs-print-doc h2,
  .intellidocs-print-doc h3,
  .intellidocs-print-doc h4 {
    break-after: avoid;
    page-break-after: avoid;
  }
  .intellidocs-print-doc blockquote { margin: 0.15in 0.4in; }
  .intellidocs-print-doc table { border-collapse: collapse; width: 100%; }
  .intellidocs-print-doc th,
  .intellidocs-print-doc td { border: 1px solid #444; padding: 4pt; vertical-align: top; }
  .intellidocs-print-doc img { max-width: 100%; height: auto; }
  .intellidocs-print-doc [data-tab] { display: inline-block; min-width: 0.5in; }
  .intellidocs-print-doc .intellidocs-page-break,
  .intellidocs-print-doc hr.page-break {
    page-break-after: always;
    break-after: page;
    height: 0 !important;
    min-height: 0 !important;
    border: 0;
    margin: 0;
    padding: 0;
    visibility: hidden;
  }
  .intellidocs-print-doc .rm-pages-wrapper { display: none !important; }
  .intellidocs-print-doc .doc-guide,
  .intellidocs-print-doc [data-blueprint-guide] {
    border: none !important;
    background: transparent !important;
  }
  ${scopedPreset}
</style>
</head>
<body>
  <table class="intellidocs-print-sheet">
    <thead><tr><td style="height: ${margins.top}in;"></td></tr></thead>
    <tfoot><tr><td style="height: ${margins.bottom}in;"></td></tr></tfoot>
    <tbody><tr><td>
      <div class="intellidocs-print-doc">${html}</div>
    </td></tr></tbody>
  </table>
</body>
</html>`
}

/** Generate the headless print page used by the thesis "Export as PDF" flow. */
export function buildThesisPdfHtml(html: string, title: string): string {
  return buildDocumentPdfHtml(html, title, {
    pageSize: 'letter',
    orientation: 'portrait',
    margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  })
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
export function exportThesisWord(html: string, title: string, options: { bodyStart?: number } = {}): void {
  const fileTitle = (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '')
  downloadBlob(
    buildThesisWordHtml(html, title, options),
    `${fileTitle} Thesis (Defense-Ready).doc`,
    'application/msword;charset=utf-8'
  )
}

/** Print HTML cleanly inside a hidden iframe (never opening a new browser tab). */
function printHtmlViaHiddenIframe(fullHtml: string): void {
  const existing = document.getElementById('intellidocs-pdf-print-frame')
  if (existing?.parentNode) existing.parentNode.removeChild(existing)

  const frame = document.createElement('iframe')
  frame.id = 'intellidocs-pdf-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    if (frame.parentNode) frame.parentNode.removeChild(frame)
    return
  }

  doc.open()
  doc.write(fullHtml)
  doc.close()

  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    if (frame.parentNode) frame.parentNode.removeChild(frame)
  }

  win.addEventListener('afterprint', cleanup, { once: true })
  // Safety cleanup if a browser skips afterprint.
  window.setTimeout(cleanup, 60_000)

  const triggerPrint = (): void => {
    win.focus()
    win.print()
  }

  // Let web fonts settle briefly before opening the print preview.
  if (doc.fonts?.ready) {
    void doc.fonts.ready.then(() => requestAnimationFrame(triggerPrint))
  } else {
    requestAnimationFrame(triggerPrint)
  }
}

/** Export the current document via the browser Save-as-PDF dialog without opening a new tab. */
export function exportDocumentPdf(html: string, title: string, options: PdfExportOptions = {}): void {
  printHtmlViaHiddenIframe(buildDocumentPdfHtml(html, title, options))
}

/** One-click PDF export: opens the Save-as-PDF dialog in a hidden iframe (no new tab). */
export function exportThesisPdf(html: string, title: string): void {
  printHtmlViaHiddenIframe(buildThesisPdfHtml(html, title))
}