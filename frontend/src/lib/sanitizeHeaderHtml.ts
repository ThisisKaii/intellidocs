/** Tags an imported header or footer may use; others are unwrapped (scripts and the like are removed). */
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'SPAN', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'IMG',
  'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'A', 'HR',
])

const REMOVED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'FORM', 'INPUT'])

/** Inline style properties kept from imported header markup. */
const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background', 'background-color', 'box-sizing', 'overflow', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height',
  'text-align', 'text-decoration', 'text-indent', 'letter-spacing', 'vertical-align', 'white-space',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-collapse',
  'width', 'height', 'max-width', 'max-height', 'object-fit', 'min-width', 'min-height', 'display', 'flex', 'align-items', 'justify-content',
  'position', 'left', 'right', 'top', 'bottom', 'float', 'mix-blend-mode', 'pointer-events', 'opacity', 'z-index',
])

/** Values that could load remote resources or run code are never kept. */
const UNSAFE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|behavior:/i

/** Image sources an imported header may use: uploaded pictures and inline images. */
function safeSource(value: string): boolean {
  return /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(value.trim())
}

/** Keep only safe declarations of an inline style attribute. */
function cleanStyle(style: string): string {
  const kept: string[] = []
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 1) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (ALLOWED_STYLE_PROPS.has(property) && value && !UNSAFE_VALUE.test(value)) kept.push(`${property}:${value}`)
  }
  return kept.join(';')
}

/**
 * Reduce imported header/footer HTML to safe markup before the pagination
 * library writes it with innerHTML: allowed tags only, no event handlers or
 * scripts, safe styles, and https or inline-image sources. Other people open
 * shared documents, so this runs on every render and not only at import.
 */
export function sanitizeHeaderHtml(html: string): string {
  if (!html || !html.includes('<')) return html
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return ''
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (REMOVED_TAGS.has(element.tagName.toUpperCase())) {
      element.remove()
      continue
    }
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name === 'style') {
        const cleaned = cleanStyle(attribute.value)
        if (cleaned) element.setAttribute('style', cleaned)
        else element.removeAttribute('style')
      } else if (name === 'src' && element.tagName === 'IMG') {
        if (!safeSource(attribute.value)) element.remove()
      } else if (!['colspan', 'rowspan', 'width', 'height', 'alt'].includes(name)) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return root.innerHTML
}
