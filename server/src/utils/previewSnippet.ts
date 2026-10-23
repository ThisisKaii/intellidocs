/** Tags kept in the stored grid preview (a faithful, lightweight first page). */
const PREVIEW_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup', 'blockquote', 'li', 'ul', 'ol',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
])

/** Inline CSS properties a preview may keep; everything else is dropped. */
const PREVIEW_STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align',
  'line-height', 'text-indent', 'color', 'background-color', 'vertical-align', 'width', 'height',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-collapse',
  'letter-spacing', 'text-transform', 'white-space',
])

/** Elements removed together with their contents. */
const DROP_BLOCKS = /<(script|style|svg|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi

/** Void or unsupported elements removed entirely. */
const DROP_VOID = /<(link|meta|embed|object|iframe|script|style|hr)\b[^>]*>/gi

/** Embedded (base64) images are far too heavy to store; they become a grey box of the same size. */
const DATA_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']data:[^>]*>/gi

/** Maximum preview length (characters) before the markup is cut at a tag boundary. */
const PREVIEW_MAX_CHARS = 24000

/** Keep only whitelisted, url()-free declarations from an inline style string. */
function filterStyle(style: string): string {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .map((declaration) => {
      const [prop, ...rest] = declaration.split(':')
      return { prop: prop.trim().toLowerCase(), value: rest.join(':').trim() }
    })
    .filter(({ prop, value }) => PREVIEW_STYLE_PROPS.has(prop) && value !== '' && !/url\(|expression\(|javascript:/i.test(value))
    .map(({ prop, value }) => `${prop}: ${value}`)
    .join('; ')
}

/** Read one attribute value out of a raw tag string (double or single quoted). */
function readAttribute(rawTag: string, name: string): string | null {
  const match = rawTag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[2] ?? match[3] ?? '') : null
}

/** Rebuild a tag with only the attributes a preview needs. */
function cleanTag(slash: string, tag: string, raw: string): string {
  const name = tag.toLowerCase()
  if (!PREVIEW_TAGS.has(name)) return ''
  if (slash) return `</${name}>`
  const attrs: string[] = []
  const style = readAttribute(raw, 'style')
  if (style) {
    const safe = filterStyle(style.replace(/&quot;/g, "'"))
    if (safe) attrs.push(`style="${safe.replace(/"/g, "'")}"`)
  }
  for (const key of ['data-doc-role', 'colspan', 'rowspan']) {
    const value = readAttribute(raw, key)
    if (value && /^[\w-]{1,40}$/.test(value)) attrs.push(`${key}="${value}"`)
  }
  if (name === 'img') {
    const src = readAttribute(raw, 'src')
    if (!src || !/^https?:\/\//i.test(src)) return ''
    attrs.push(`src="${src.replace(/"/g, '&quot;')}"`)
  }
  return `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`
}

/**
 * First-page slice of document HTML stored for the dashboard thumbnail. The
 * markup keeps fonts, alignment, spacing, tables and linked images so the card
 * can render a faithful first page; scripts, classes, event handlers and
 * embedded image bytes are removed.
 */
export function extractPreviewSnippet(content: string): string {
  const withoutData = content.replace(DATA_IMAGE, (tag: string) => {
    const style = readAttribute(tag, 'style') ?? ''
    const width = readAttribute(tag, 'width')
    const height = readAttribute(tag, 'height')
    const size = [
      width && /^\d+$/.test(width) ? `width: ${width}px` : '',
      height && /^\d+$/.test(height) ? `height: ${height}px` : '',
    ].filter(Boolean).join('; ')
    return `<div style="${[filterStyle(style), size, 'background-color: #e5e7eb'].filter(Boolean).join('; ')}"></div>`
  })
  const breakIndex = withoutData.search(/<div[^>]*class="[^"]*intellidocs-page-break/i)
  const firstPage = breakIndex > 0 ? withoutData.slice(0, breakIndex) : withoutData
  const cleaned = firstPage
    .replace(DROP_BLOCKS, '')
    .replace(DROP_VOID, '')
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (raw: string, slash: string, tag: string) => cleanTag(slash, tag, raw))
    .trim()
  if (cleaned.length <= PREVIEW_MAX_CHARS) return cleaned
  // Cut at the last complete tag so the card never renders a half-written one.
  return cleaned.slice(0, PREVIEW_MAX_CHARS).replace(/<[^>]*$/, '')
}
