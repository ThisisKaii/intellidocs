const uploadDocumentImage = jest.fn()
jest.mock('../../models/documentModel', () => ({
  uploadDocumentImage: (...args: unknown[]) => uploadDocumentImage(...args),
}))

import { uploadImportImages } from '../uploadImportImages'

const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('uploadImportImages', () => {
  beforeEach(() => {
    uploadDocumentImage.mockReset()
  })

  it('returns html without images untouched and never uploads', async () => {
    const html = '<p>hello</p><img src="https://x/y.png">'
    expect(await uploadImportImages('u1', html)).toBe(html)
    expect(uploadDocumentImage).not.toHaveBeenCalled()
  })

  it('swaps data URIs for storage URLs and uploads identical images once', async () => {
    uploadDocumentImage.mockResolvedValueOnce('https://cdn/a.png').mockResolvedValueOnce('https://cdn/b.png')
    const html =
      `<img src="data:image/png;base64,${PNG_A}"><img src="data:image/png;base64,${PNG_B}">` +
      `<img src="data:image/png;base64,${PNG_A}" width="10">`

    const result = await uploadImportImages('u1', html)

    expect(uploadDocumentImage).toHaveBeenCalledTimes(2)
    expect(result).toBe(
      '<img src="https://cdn/a.png"><img src="https://cdn/b.png"><img src="https://cdn/a.png" width="10">'
    )
  })

  it('keeps an image inline when its upload fails', async () => {
    uploadDocumentImage.mockRejectedValueOnce(new Error('bucket missing'))
    const html = `<img src="data:image/png;base64,${PNG_A}">`
    expect(await uploadImportImages('u1', html)).toBe(html)
  })
})
