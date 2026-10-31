import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Previewer } from 'pagedjs'
import { Printer, X } from 'lucide-react'
import katex from 'katex'
import { groupBySpan } from './ieeeSpan'

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
/* Level 1 is set in small caps, as the Word export writes it. */
.ieee-doc .ieee-body h1 { font-size: 10pt; font-weight: 400; font-variant: small-caps; text-transform: none; text-align: center; margin: 12pt 0 4pt; }
.ieee-doc .ieee-body h2 { font-size: 10pt; font-weight: 400; font-style: italic; text-align: left; margin: 8pt 0 3pt; }
.ieee-doc .ieee-body h3 { font-size: 10pt; font-weight: 400; font-style: italic; text-align: left; margin: 6pt 0 2pt; }
/* The Word export puts 3pt after a paragraph; the preview matches it so the two agree. */
.ieee-doc .ieee-body p { margin: 0 0 3pt; text-indent: 0.2in; }
.ieee-doc .ieee-body [data-caption-kind] { font-size: 8pt; text-align: center; text-indent: 0; }
/* A table, figure or equation the author runs across both columns, with its caption. */
.ieee-doc .ieee-span { column-span: all; margin: 6pt 0; }
.ieee-doc .ieee-span p[data-caption-kind] { margin: 0 0 3pt; }
/* Paged.js marks every block it splits and then justifies the last line of each; a centred or left-set
   block must keep its own alignment. */
.ieee-doc h1[data-align-last-split-element], .ieee-doc h2[data-align-last-split-element], .ieee-doc h3[data-align-last-split-element],
.ieee-doc [data-caption-kind][data-align-last-split-element], .ieee-doc .ieee-front [data-align-last-split-element] { text-align-last: auto !important; }
.ieee-doc [data-type='block-math'] { position: relative; margin: 6pt 0; text-indent: 0; }
.ieee-doc [data-type='block-math'] .katex-display { margin: 0; }
.ieee-doc [data-type='block-math'][data-number]::after { content: '(' attr(data-number) ')'; position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
.ieee-doc img { max-width: 100%; height: auto; }
.ieee-doc table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.ieee-doc td, .ieee-doc th { border: 1px solid #000; padding: 2pt; }`

/**
 * Draws every equation in the copy. The editor's saved HTML holds an equation as its LaTeX in an
 * attribute (the editor draws it with KaTeX when it shows the document), so the preview draws it too.
 */
function renderEquations(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
    const latex = el.getAttribute('data-latex') ?? ''
    try {
      katex.render(latex, el, { displayMode: el.getAttribute('data-type') === 'block-math' })
    } catch {
      el.textContent = latex
    }
  })
}

/**
 * Splits document HTML into the full-width front matter (title, authors,
 * abstract, index terms) and the two-column body, wrapped in the IEEE layout.
 */
export function buildIeeeLayoutHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  renderEquations(container)
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
  // Blocks marked full width (with their captions) run across both columns; the rest flow in two.
  const body = groupBySpan(blocks.slice(frontEnd))
    .map((group) => {
      const markup = group.elements.map((el) => el.outerHTML).join('')
      return group.full ? `<div class="ieee-span">${markup}</div>` : markup
    })
    .join('')
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
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--canvas-bg, #e5e7eb)', overflow: 'auto' }}
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
