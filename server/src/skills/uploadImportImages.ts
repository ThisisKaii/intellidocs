import { createHash } from 'crypto'
import { uploadDocumentImage } from '../models/documentModel'

/** Matches an inline base64 image source such as `src="data:image/png;base64,AAAA"`. */
const DATA_URI_SOURCE = /src="data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)"/gi

/** One whole inline base64 image source (an editor JSON `src` attribute). */
const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i

/** Identity of an inline image: identical images upload once. */
function imageKey(mimetype: string, base64: string): string {
  return createHash('sha256').update(mimetype).update(base64.replace(/\s+/g, '')).digest('hex')
}

/**
 * Move base64 images in imported HTML into storage and point the HTML at their
 * public URLs, so documents stay small. Identical images upload once. Any
 * upload failure leaves that image inline, so an import never fails because of
 * storage. Also returns where each image went (by imageKey), so the editor JSON
 * of the same document can point at the same files (withStoredImageSources).
 */
export async function uploadImportImagesWithSources(
  userId: string,
  html: string,
): Promise<{ html: string; stored: Map<string, string> }> {
  const stored = new Map<string, string>()
  if (!html.includes('data:image/')) return { html, stored }

  const attempted = new Set<string>()
  const matches = Array.from(html.matchAll(DATA_URI_SOURCE))

  for (const [, mimetype, base64] of matches) {
    const key = imageKey(mimetype, base64)
    if (attempted.has(key)) continue
    attempted.add(key)
    try {
      const url = await uploadDocumentImage(userId, {
        buffer: Buffer.from(base64.replace(/\s+/g, ''), 'base64'),
        mimetype,
      })
      stored.set(key, url)
    } catch (error) {
      console.warn('Imported image upload failed, keeping it inline:', error)
    }
  }

  const rewritten = html.replace(DATA_URI_SOURCE, (whole: string, mimetype: string, base64: string) => {
    const url = stored.get(imageKey(mimetype, base64))
    return url ? `src="${url}"` : whole
  })
  return { html: rewritten, stored }
}

/** uploadImportImagesWithSources for HTML alone (headers, footers, documents without editor JSON). */
export async function uploadImportImages(userId: string, html: string): Promise<string> {
  return (await uploadImportImagesWithSources(userId, html)).html
}

/**
 * Editor JSON with every inline image `src` that was moved to storage replaced by its URL, exactly as
 * uploadImportImagesWithSources rewrote the HTML; an image whose upload failed stays inline in both.
 */
export function withStoredImageSources<T>(value: T, stored: Map<string, string>): T {
  if (stored.size === 0) return value
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (node === null || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) {
      if (key === 'attrs' && child !== null && typeof child === 'object' && !Array.isArray(child)) {
        const attrs: Record<string, unknown> = { ...child }
        const found = typeof attrs.src === 'string' ? DATA_URI.exec(attrs.src) : null
        const url = found ? stored.get(imageKey(found[1], found[2])) : undefined
        if (url) attrs.src = url
        out[key] = attrs
      } else {
        out[key] = visit(child)
      }
    }
    return out
  }
  return visit(value) as T
}
