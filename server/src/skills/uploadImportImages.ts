import { createHash } from 'crypto'
import { uploadDocumentImage } from '../models/documentModel'

/** Matches an inline base64 image source such as `src="data:image/png;base64,AAAA"`. */
const DATA_URI_SOURCE = /src="data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)"/gi

/**
 * Move base64 images in imported HTML into storage and point the HTML at their
 * public URLs, so documents stay small. Identical images upload once. Any
 * upload failure leaves that image inline, so an import never fails because of
 * storage.
 */
export async function uploadImportImages(userId: string, html: string): Promise<string> {
  if (!html.includes('data:image/')) return html

  const uploaded = new Map<string, string | null>()
  const matches = Array.from(html.matchAll(DATA_URI_SOURCE))

  for (const [, mimetype, base64] of matches) {
    const cleaned = base64.replace(/\s+/g, '')
    const hash = createHash('sha256').update(mimetype).update(cleaned).digest('hex')
    if (uploaded.has(hash)) continue
    try {
      const url = await uploadDocumentImage(userId, {
        buffer: Buffer.from(cleaned, 'base64'),
        mimetype,
      })
      uploaded.set(hash, url)
    } catch (error) {
      console.warn('Imported image upload failed, keeping it inline:', error)
      uploaded.set(hash, null)
    }
  }

  return html.replace(DATA_URI_SOURCE, (whole: string, mimetype: string, base64: string) => {
    const hash = createHash('sha256')
      .update(mimetype)
      .update(base64.replace(/\s+/g, ''))
      .digest('hex')
    const url = uploaded.get(hash)
    return url ? `src="${url}"` : whole
  })
}
