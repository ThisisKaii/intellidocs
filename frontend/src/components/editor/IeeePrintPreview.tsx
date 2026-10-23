import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Previewer } from 'pagedjs'
import { Printer, X } from 'lucide-react'

interface IeeePrintPreviewProps {
  /** The document's HTML as stored by the editor. */
  html: string
  /** Called when the user closes the preview. */
  onClose: () => void
}

/** Print rules: only the preview survives, and each Paged.js sheet is one printed page. */
const PRINT_CSS = `
@media print {
  body > *:not(#ieee-print-preview) { display: none !important; }
  #ieee-print-preview { position: static !important; background: none !important; overflow: visible !important; }
  #ieee-print-preview .ieee-preview-bar { display: none !important; }
  #ieee-print-preview .pagedjs_pages { margin: 0 !important; padding: 0 !important; }
  #ieee-print-preview .pagedjs_page { margin: 0 !important; box-shadow: none !important; }
}`

/** On-screen sheet look for Paged.js pages. */
const SCREEN_CSS = `
#ieee-print-preview .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0; }
#ieee-print-preview .pagedjs_page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.35); flex: none; }`

/** The exact IEEE layout: Letter, 0.75/1/0.625in margins, 10pt Times, two justified columns. */
const IEEE_PAGE_CSS = `
@page { size: 8.5in 11in; margin: 0.75in 0.625in 1in 0.625in; }
html, body { margin: 0; }
.ieee-doc { font-family: "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.15; color: #000; text-align: justify; }
.ieee-doc .ieee-front { column-span: all; text-align: center; }
.ieee-doc .ieee-front p { margin: 0 0 6pt; }
.ieee-doc .ieee-front h1 { font-size: 24pt; font-weight: 400; margin: 0 0 12pt; }
.ieee-doc .ieee-front p[style*="font-size"] { text-align: justify; font-weight: 700; }
.ieee-doc .ieee-body { columns: 2; column-gap: 0.25in; column-fill: auto; }
.ieee-doc .ieee-body h1 { font-size: 10pt; font-weight: 400; text-transform: uppercase; text-align: center; margin: 12pt 0 4pt; }
.ieee-doc .ieee-body h2 { font-size: 10pt; font-weight: 400; font-style: italic; margin: 8pt 0 3pt; }
.ieee-doc .ieee-body h3 { font-size: 10pt; font-weight: 400; font-style: italic; margin: 6pt 0 2pt; }
.ieee-doc .ieee-body p { margin: 0 0 6pt; text-indent: 0.2in; }
.ieee-doc img { max-width: 100%; height: auto; }
.ieee-doc table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.ieee-doc td, .ieee-doc th { border: 1px solid #000; padding: 2pt; }`

/**
 * Splits document HTML into the full-width front matter (title, authors,
 * abstract, index terms) and the two-column body, wrapped in the IEEE layout.
 */
export function buildIeeeLayoutHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  const blocks = Array.from(container.children)
  let frontEnd = blocks.findIndex((el) => /^\s*(?:<[^>]+>\s*)*index terms/i.test(el.innerHTML))
  if (frontEnd >= 0) {
    frontEnd += 1
  } else {
    frontEnd = blocks.findIndex(
      (el, i) => i > 0 && /^H[1-6]$/.test(el.tagName) && el.getAttribute('data-doc-role') !== 'title'
    )
    if (frontEnd < 0) frontEnd = 0
  }
  const front = blocks.slice(0, frontEnd).map((el) => el.outerHTML).join('')
  const body = blocks.slice(frontEnd).map((el) => el.outerHTML).join('')
  return `<div class="ieee-doc"><div class="ieee-front">${front}</div><div class="ieee-body">${body}</div></div>`
}

/**
 * Read-only exact IEEE layout rendered by Paged.js, with a print / save-as-PDF
 * button. It never touches the editor document; it only displays a copy.
 */
export function IeeePrintPreview({ html, onClose }: IeeePrintPreviewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<string>('Rendering…')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    // A private render target per run, so a superseded (or StrictMode-doubled)
    // render can never add pages to the one on screen.
    const target = document.createElement('div')
    host.appendChild(target)
    const previewer = new Previewer()
    previewer
      .preview(buildIeeeLayoutHtml(html), [{ 'ieee-page.css': IEEE_PAGE_CSS }], target)
      .then((flow) => {
        if (!cancelled) setStatus(`${flow.total} page${flow.total === 1 ? '' : 's'}`)
      })
      .catch(() => {
        if (!cancelled) setStatus('Preview failed')
      })
    return () => {
      cancelled = true
      target.remove()
    }
  }, [html])

  return createPortal(
    <div
      id="ieee-print-preview"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--canvas-bg, #e5e7eb)', overflow: 'auto' }}
    >
      <style>{SCREEN_CSS + PRINT_CSS}</style>
      <div
        className="ieee-preview-bar"
        style={{
          position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', background: 'var(--card, #fff)', borderBottom: '1px solid var(--border, #ddd)',
        }}
      >
        <strong>IEEE print preview</strong>
        <span data-testid="ieee-preview-status">{status}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => window.print()} title="Print or save as PDF" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Printer size={14} /> Print / PDF
        </button>
        <button type="button" onClick={onClose} title="Close preview" style={{ display: 'flex', alignItems: 'center' }}>
          <X size={14} />
        </button>
      </div>
      <div ref={hostRef} />
    </div>,
    document.body
  )
}
