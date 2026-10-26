/** Fonts the editor ships a same-width twin for (mirrors the converter's metric twins): no warning needed. */
const COVERED_FAMILIES = new Set([
  'times new roman', 'times', 'arial', 'helvetica', 'calibri', 'cambria', 'courier new', 'courier',
  'tinos', 'arimo', 'carlito', 'caladea', 'cousine',
])

/** CSS generic names: never reported as missing. */
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial'])

const PROBE = 'mmmmmmmmmmlliWQ@#0123 The quick brown fox'
const BASES = ['monospace', 'serif', 'sans-serif']

let probeContext: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, boolean>()

/** A canvas context for measuring text, made once; null when the browser has none. */
function measurer(): CanvasRenderingContext2D | null {
  if (probeContext === undefined) {
    try {
      probeContext = document.createElement('canvas').getContext('2d')
    } catch {
      probeContext = null
    }
  }
  return probeContext
}

/** Width of the probe text in a font stack. */
function widthIn(context: CanvasRenderingContext2D, font: string): number {
  context.font = `72px ${font}`
  return context.measureText(PROBE).width
}

/**
 * Whether a font family is installed or loaded. A missing family falls back, so the probe text
 * measures the same as the fallback alone; an available one measures differently in at least one
 * of three fallbacks. (`document.fonts.check` cannot be used: it says true for unknown fonts.)
 */
export function isFontAvailable(family: string): boolean {
  const key = family.toLowerCase()
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const context = measurer()
  let available = true
  if (context) {
    available = BASES.some((base) => widthIn(context, `"${family}", ${base}`) !== widthIn(context, base))
  }
  cache.set(key, available)
  return available
}

/** The first family of every `font-family` stack a piece of document HTML sets, in order of first use. */
export function fontFamiliesIn(html: string): string[] {
  const found = new Set<string>()
  for (const match of html.replace(/&quot;/g, "'").matchAll(/font-family:\s*([^;"]+)/gi)) {
    const first = match[1].split(',')[0].replace(/["']/g, '').trim()
    if (first) found.add(first)
  }
  return [...found]
}

/** The families a document names that this computer lacks and the editor has no same-width twin for. */
export function missingFonts(families: string[]): string[] {
  return families.filter((family) => {
    const lowered = family.toLowerCase()
    if (COVERED_FAMILIES.has(lowered) || GENERIC_FAMILIES.has(lowered)) return false
    return !isFontAvailable(family)
  })
}

const NOTICE_KEY = 'intellidocs.fontNoticeDismissed.'

/** Whether the person already dismissed the missing-font notice for this document (false when storage is blocked). */
export function fontNoticeDismissed(documentId: string | undefined): boolean {
  if (!documentId) return false
  try {
    return localStorage.getItem(NOTICE_KEY + documentId) === '1'
  } catch {
    return false
  }
}

/** Remember that the missing-font notice was dismissed for this document. */
export function dismissFontNotice(documentId: string | undefined): void {
  if (!documentId) return
  try {
    localStorage.setItem(NOTICE_KEY + documentId, '1')
  } catch {
    // Storage blocked: the notice simply shows again next time.
  }
}
