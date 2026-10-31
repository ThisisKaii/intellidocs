import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ACADEMIC_PRESETS, basePresetKey } from '@/components/editor/academicPresets'
import { PAGE_SIZES, inToPx } from '@/components/editor/HeaderFooterPlugin'
import type { MarginValues, PageOrientation, PageSizeKey } from '@/components/editor/HeaderFooterPlugin'

/** Page setup a thumbnail needs to look like the real first page. */
export interface PreviewPageSetup {
  pageSize: PageSizeKey | null
  orientation: PageOrientation | null
  margins: MarginValues | null
  formattingPreset: string | null
}

/** Tags the preview keeps; every other tag is unwrapped. */
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'MARK', 'SUB', 'SUP', 'BLOCKQUOTE', 'LI', 'UL', 'OL',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG',
])

/** Non-content elements dropped together with their contents. */
const DROPPED_SELECTOR = 'script, style, iframe, object, embed, svg, link, meta'

/** Inline CSS properties a preview may keep from the document. */
const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight',
  'letter-spacing', 'line-height', 'list-style-type', 'text-align', 'text-decoration',
  'text-indent', 'text-transform', 'vertical-align', 'white-space', 'width', 'height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-collapse',
])

/** Values that could load remote resources or run code are never kept. */
const UNSAFE_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|behavior:/i

/** Attributes copied through verbatim (after a basic shape check). */
const PASSTHROUGH_ATTRS = ['colspan', 'rowspan', 'data-doc-role']

/** Keep only safe formatting declarations from an inline style attribute. */
function sanitizeStyle(style: string): string {
  const safe: string[] = []
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator === -1) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!ALLOWED_STYLE_PROPS.has(property) || !value) continue
    if (UNSAFE_STYLE_VALUE.test(value) || value.includes('<') || value.includes('>')) continue
    safe.push(`${property}: ${value}`)
  }
  return safe.join('; ')
}

/**
 * Reduce a stored preview snippet to markup built only from ALLOWED_TAGS, safe
 * inline formatting and http(s) images, so the card renders the real first
 * page. The result is safe to inject as HTML.
 */
export function sanitizePreviewHtml(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const parsed = new DOMParser().parseFromString(`<div id="preview-root">${trimmed}</div>`, 'text/html')
  const root = parsed.getElementById('preview-root')
  if (!root) return ''
  for (const el of Array.from(root.querySelectorAll(DROPPED_SELECTOR))) el.remove()

  // An equation is drawn from its data-latex attribute, which the card does not keep; its LaTeX
  // source stands in for it so the line is not left with a gap.
  for (const el of Array.from(root.querySelectorAll('[data-type="inline-math"], [data-type="block-math"]'))) {
    el.textContent = el.getAttribute('data-latex') ?? ''
  }

  // Collect first, then mutate: unwrapping during the walk disturbs it.
  const elements: Element[] = []
  const walker = parsed.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) elements.push(node as Element)

  for (const el of elements) {
    if (!ALLOWED_TAGS.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes))
      continue
    }
    const style = el.getAttribute('style')
    const kept: Record<string, string> = {}
    for (const name of PASSTHROUGH_ATTRS) {
      const value = el.getAttribute(name)
      if (value && /^[\w-]{1,40}$/.test(value)) kept[name] = value
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? ''
      if (!/^https?:\/\//i.test(src)) {
        el.remove()
        continue
      }
      kept.src = src
      kept.loading = 'lazy'
    }
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
    for (const [name, value] of Object.entries(kept)) el.setAttribute(name, value)
    const safeStyle = style ? sanitizeStyle(style) : ''
    if (safeStyle) el.setAttribute('style', safeStyle)
  }
  return root.innerHTML
}

/** Base document typography, mirroring the editor's defaults so imports look the same on the card. */
const PREVIEW_CSS = `
.dd-preview { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.6; color: #1c1917; overflow: hidden; }
.dd-preview p { margin: 0 0 0.25em; line-height: 1.5; min-height: 1em; }
.dd-preview h1 { font-size: 18pt; font-weight: 700; margin: 0.4em 0 0.25em; }
.dd-preview h1[data-doc-role='title'] { text-align: center; }
.dd-preview h2 { font-size: 14.5pt; font-weight: 700; margin: 0.4em 0 0.25em; }
.dd-preview h3, .dd-preview h4, .dd-preview h5, .dd-preview h6 { font-size: 12.5pt; font-weight: 700; margin: 0.3em 0 0.2em; }
.dd-preview ul, .dd-preview ol { margin: 0 0 0.25em; padding-left: 1.6em; }
.dd-preview ul { list-style: disc; } .dd-preview ol { list-style: decimal; }
.dd-preview blockquote { margin: 0.5em 0 0.5em 1.5em; font-style: italic; }
.dd-preview table { border-collapse: collapse; width: 100%; table-layout: auto; }
.dd-preview td, .dd-preview th { vertical-align: top; }
.dd-preview img { max-width: 100%; height: auto; }
`

/**
 * Scope a preset stylesheet to preview cards. Presets are written for the live
 * editor: some rules hang off `.intellidocs-page-editor .ProseMirror` and the
 * heading rules are bare (`h1 { … }`), which would restyle every heading on the
 * dashboard if injected as-is.
 */
function scopePresetCss(css: string, key: string): string {
  const scope = `.dd-preview--${key}`
  return css
    .replace(/\.intellidocs-page-editor \.ProseMirror/g, scope)
    .replace(/^(h[1-6](?:\[[^\]]*\])?)\s*\{/gm, `${scope} $1 {`)
}

/** Render once per page: base preview typography plus every preset scoped to its own card class. */
export function PreviewStyles(): JSX.Element {
  return (
    <style>
      {PREVIEW_CSS}
      {ACADEMIC_PRESETS.map((preset) => scopePresetCss(preset.css, preset.key)).join('\n')}
    </style>
  )
}

/** Print-size canvas for the page setup, falling back to US Letter. */
function pageCanvas(setup: PreviewPageSetup): { width: number; height: number; padding: string } {
  const preset = PAGE_SIZES[setup.pageSize ?? 'short'] ?? PAGE_SIZES.short
  const landscape = setup.orientation === 'landscape'
  const m = setup.margins ?? { top: 1, bottom: 1, left: 1.5, right: 1 }
  return {
    width: landscape ? preset.height : preset.width,
    height: landscape ? preset.width : preset.height,
    padding: `${inToPx(m.top)}px ${inToPx(m.right)}px ${inToPx(m.bottom)}px ${inToPx(m.left)}px`,
  }
}

/**
 * Render the first page at true print size and scale it to the card's width.
 * The scale is measured (not hardcoded) so the page fills the card edge to edge
 * at any grid width; taller pages are cropped by the card like Google Docs.
 */
export function DocumentPreview({
  html,
  setup,
  priority = true,
}: {
  html: string
  setup: PreviewPageSetup
  /**
   * True for the top-most cards: their page renders immediately. Others show the placeholder
   * until they scroll near the screen, so the first row of a long list appears first.
   */
  priority?: boolean
}): JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvas = useMemo(() => pageCanvas(setup), [setup])
  const presetKey = ACADEMIC_PRESETS.find((preset) => preset.key === basePresetKey(setup.formattingPreset))?.key
  const [scale, setScale] = useState(0.25)
  const [near, setNear] = useState<boolean>(priority || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (near) return
    const frame = frameRef.current
    if (!frame) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [near])

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const fit = (): void => {
      if (frame.clientWidth) setScale(frame.clientWidth / canvas.width)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [canvas.width])

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full select-none overflow-hidden bg-white pointer-events-none"
    >
      {html && near ? (
        <>
          <div
            className={`dd-preview ${presetKey ? `dd-preview--${presetKey}` : ''} absolute left-0 top-0 bg-white`}
            style={{
              width: `${canvas.width}px`,
              height: `${canvas.height}px`,
              padding: canvas.padding,
              boxSizing: 'border-box',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            // Safe: sanitizePreviewHtml keeps only whitelisted tags, attributes and styles.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </>
      ) : (
        <div className="flex flex-col gap-2 p-4 pt-5 opacity-60">
          <div className="mb-2 h-2.5 w-1/2 rounded-sm bg-slate-300" />
          <div className="h-1.5 w-full rounded-sm bg-slate-200" />
          <div className="h-1.5 w-11/12 rounded-sm bg-slate-200" />
          <div className="h-1.5 w-5/6 rounded-sm bg-slate-200" />
          <div className="mt-2 h-1.5 w-full rounded-sm bg-slate-200" />
          <div className="h-1.5 w-3/4 rounded-sm bg-slate-200" />
        </div>
      )}
    </div>
  )
}
