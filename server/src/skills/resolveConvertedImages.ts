import { fetchConvertedImage, releaseConvertedImages } from '../ai/bridge/pythonBridge'
import { deleteDocumentImages, uploadDocumentImage } from '../models/documentModel'
import type { PythonConversionResponse } from '../../schemas/predictionSchemas'

/** A picture token the converter writes with images=separate. */
const IMAGE_TOKEN = /idoc-image:([0-9a-f]{32})/g

/** How many pictures are fetched and stored at once. */
const CONCURRENCY = 6

/** Store one picture and return its URL. */
export type StoreImage = (image: { buffer: Buffer; mimetype: string }) => Promise<string>

/**
 * Stores an import's pictures for one user and remembers them, so an import that ends up not
 * using them (the document could not be created, or a fallback converter replaced the result)
 * removes them again: a long manuscript's pictures are hundreds of megabytes of storage.
 */
export function importImageStore(userId: string): { store: StoreImage; discard: () => Promise<void> } {
  const stored: string[] = []
  return {
    store: async (image) => {
      const url = await uploadDocumentImage(userId, image)
      stored.push(url)
      return url
    },
    discard: async () => {
      const urls = stored.splice(0, stored.length)
      if (urls.length > 0) await deleteDocumentImages(urls).catch(() => undefined)
    },
  }
}

interface Deps {
  fetchImage: (imageSet: string, key: string) => Promise<Buffer>
  release: (imageSet: string) => Promise<void>
}

const defaultDeps: Deps = { fetchImage: fetchConvertedImage, release: releaseConvertedImages }

/** Every string in a value with its picture tokens replaced. */
function replaceTokens<T>(value: T, sources: Map<string, string>): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.includes('idoc-image:') ? node.replace(IMAGE_TOKEN, (whole, key: string) => sources.get(key) ?? whole) : node
    }
    if (Array.isArray(node)) return node.map(visit)
    if (node === null || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) out[key] = visit(child)
    return out
  }
  return visit(value) as T
}

/**
 * Put a separate-images conversion's pictures back: each is fetched from the converter one at a
 * time, stored, and its token replaced by the stored URL everywhere in the result. A picture that
 * cannot be stored goes back inline (the later import steps move inline pictures as usual), and
 * one the converter no longer has is left out. A result without an image set is returned as is.
 * The converter's copy of the pictures is released whatever happens, also when `beforeStore` throws.
 */
export async function resolveConvertedImages(
  result: PythonConversionResponse,
  store: StoreImage,
  deps: Deps = defaultDeps,
  options: {
    /** Runs before any picture is stored, with their total size: throw to stop (a full quota). */
    beforeStore?: (pictureBytes: number) => Promise<void>
    /** After each picture is done (stored, kept inline or left out): how many of how many. */
    onPicture?: (done: number, total: number) => void
  } = {},
): Promise<PythonConversionResponse> {
  const { image_set: imageSet, images = [], ...rest } = result
  if (!imageSet) return result
  const sources = new Map<string, string>()
  try {
    await options.beforeStore?.(images.reduce((sum, image) => sum + image.bytes, 0))
    let next = 0
    let finished = 0
    const worker = async (): Promise<void> => {
      while (next < images.length) {
        const { key, mime } = images[next++]
        try {
          await storeOne(key, mime)
        } finally {
          finished += 1
          options.onPicture?.(finished, images.length)
        }
      }
    }
    const storeOne = async (key: string, mime: string): Promise<void> => {
      let buffer: Buffer
      try {
        buffer = await deps.fetchImage(imageSet, key)
      } catch (error) {
        console.warn(`Converted picture ${key} could not be fetched, leaving it out:`, error)
        sources.set(key, '')
        return
      }
      try {
        sources.set(key, await store({ buffer, mimetype: mime }))
      } catch (error) {
        console.warn('Imported image upload failed, keeping it inline:', error)
        sources.set(key, `data:${mime};base64,${buffer.toString('base64')}`)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, worker))
  } finally {
    await deps.release(imageSet)
  }
  return replaceTokens(rest, sources)
}
