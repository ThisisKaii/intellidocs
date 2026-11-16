jest.mock('../../ai/bridge/pythonBridge', () => ({
  fetchConvertedImage: jest.fn(),
  releaseConvertedImages: jest.fn(),
}))

const uploadDocumentImage = jest.fn()
const deleteDocumentImages = jest.fn()
jest.mock('../../models/documentModel', () => ({
  uploadDocumentImage: (...args: unknown[]) => uploadDocumentImage(...args),
  deleteDocumentImages: (...args: unknown[]) => deleteDocumentImages(...args),
}))

import { importImageStore, resolveConvertedImages } from '../resolveConvertedImages'
import type { PythonConversionResponse } from '../../../schemas/predictionSchemas'

const KEY_A = 'a'.repeat(32)
const KEY_B = 'b'.repeat(32)

function conversion(extra: Partial<PythonConversionResponse> = {}): PythonConversionResponse {
  return {
    html: `<p><img src="idoc-image:${KEY_A}"></p><p><img src="idoc-image:${KEY_B}"></p>`,
    content_json: { type: 'doc', content: [{ type: 'image', attrs: { src: `idoc-image:${KEY_A}` } }] },
    page_setup: { page_size: 'a4', orientation: 'portrait', margins: { top: 1, bottom: 1, left: 1, right: 1 } },
    header: '',
    footer: '',
    page_art: { repeat: `<div style="background:url(idoc-image:${KEY_B})"></div>`, pages: {}, overlays: {} },
    image_set: 'f'.repeat(32),
    images: [
      { key: KEY_A, mime: 'image/png', bytes: 3 },
      { key: KEY_B, mime: 'image/jpeg', bytes: 3 },
    ],
    ...extra,
  } as PythonConversionResponse
}

describe('resolveConvertedImages', () => {
  it('stores each picture once and puts its URL in place of every token', async () => {
    const fetchImage = jest.fn(async (_set: string, key: string) => Buffer.from(key.slice(0, 3)))
    const release = jest.fn(async () => undefined)
    const store = jest.fn(async ({ mimetype }: { buffer: Buffer; mimetype: string }) => `https://cdn/${mimetype}`)

    const out = await resolveConvertedImages(conversion(), store, { fetchImage, release })

    expect(store).toHaveBeenCalledTimes(2)
    expect(out.html).toBe('<p><img src="https://cdn/image/png"></p><p><img src="https://cdn/image/jpeg"></p>')
    expect(JSON.stringify(out.content_json)).toContain('https://cdn/image/png')
    expect(out.page_art?.repeat).toContain('url(https://cdn/image/jpeg)')
    expect(out).not.toHaveProperty('image_set')
    expect(out).not.toHaveProperty('images')
    expect(release).toHaveBeenCalledWith('f'.repeat(32))
  })

  it('keeps a picture inline when storing it fails, and leaves out one the converter lost', async () => {
    const fetchImage = jest.fn(async (_set: string, key: string) => {
      if (key === KEY_B) throw new Error('gone')
      return Buffer.from('abc')
    })
    const store = jest.fn(async () => { throw new Error('bucket full') })

    const out = await resolveConvertedImages(conversion(), store, { fetchImage, release: async () => undefined })

    expect(out.html).toBe(`<p><img src="data:image/png;base64,${Buffer.from('abc').toString('base64')}"></p><p><img src=""></p>`)
  })

  it('returns a conversion without an image set untouched', async () => {
    const plain = conversion({ image_set: undefined, images: undefined })
    const store = jest.fn()
    expect(await resolveConvertedImages(plain, store)).toBe(plain)
    expect(store).not.toHaveBeenCalled()
  })

  it('releases the set even when storing throws unexpectedly', async () => {
    const release = jest.fn(async () => undefined)
    const fetchImage = jest.fn(async () => { throw new Error('down') })
    await resolveConvertedImages(conversion(), jest.fn(), { fetchImage, release })
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('importImageStore', () => {
  beforeEach(() => {
    uploadDocumentImage.mockReset()
    deleteDocumentImages.mockReset()
  })

  it('removes the pictures an import stored when it ends up not using them', async () => {
    uploadDocumentImage.mockImplementation(async (_user: string, image: { mimetype: string }) => `https://cdn/${image.mimetype}`)
    deleteDocumentImages.mockResolvedValue(undefined)
    const pictures = importImageStore('user-1')
    await pictures.store({ buffer: Buffer.from('a'), mimetype: 'image/png' })
    await pictures.store({ buffer: Buffer.from('b'), mimetype: 'image/jpeg' })
    expect(uploadDocumentImage).toHaveBeenCalledWith('user-1', expect.objectContaining({ mimetype: 'image/png' }))
    await pictures.discard()
    expect(deleteDocumentImages).toHaveBeenCalledWith(['https://cdn/image/png', 'https://cdn/image/jpeg'])
    // Discarding twice removes nothing more.
    await pictures.discard()
    expect(deleteDocumentImages).toHaveBeenCalledTimes(1)
  })

  it('never fails the import over a picture it cannot remove', async () => {
    uploadDocumentImage.mockResolvedValue('https://cdn/x')
    deleteDocumentImages.mockRejectedValue(new Error('storage down'))
    const pictures = importImageStore('user-1')
    await pictures.store({ buffer: Buffer.from('a'), mimetype: 'image/png' })
    await expect(pictures.discard()).resolves.toBeUndefined()
  })
})
