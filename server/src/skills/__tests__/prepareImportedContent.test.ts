const uploadDocumentImage = jest.fn()
jest.mock('../../models/documentModel', () => ({
  uploadDocumentImage: (...args: unknown[]) => uploadDocumentImage(...args),
}))

import { EDITOR_JSON_MAX_CHARS } from '../../../schemas/documentSchemas'
import type { EditorJson } from '../../types/index'
import { prepareImportedContent } from '../prepareImportedContent'
import { withStoredImageSources } from '../uploadImportImages'

const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const uri = (base64: string): string => `data:image/png;base64,${base64}`

const image = (src: string): Record<string, unknown> => ({ type: 'imageResize', attrs: { src, width: 10, alignment: 'center' } })
const doc = (...content: unknown[]): EditorJson => ({ type: 'doc', content })

describe('prepareImportedContent', () => {
  beforeEach(() => uploadDocumentImage.mockReset())

  it('points the HTML and the JSON at the same stored pictures', async () => {
    uploadDocumentImage.mockResolvedValueOnce('https://cdn/a.png').mockResolvedValueOnce('https://cdn/b.png')
    const html = `<p>x</p><img src="${uri(PNG_A)}"><img src="${uri(PNG_B)}">`
    // A picture in a table cell is found too.
    const cell = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [image(uri(PNG_B))] }] }] }
    const { content, content_json } = await prepareImportedContent('u1', html, doc(image(uri(PNG_A)), cell))

    expect(content).toBe('<p>x</p><img src="https://cdn/a.png"><img src="https://cdn/b.png">')
    expect(JSON.stringify(content_json)).not.toContain('data:image')
    expect(content_json?.content?.[0]).toEqual(image('https://cdn/a.png'))
    expect(JSON.stringify(content_json?.content?.[1])).toContain('https://cdn/b.png')
    expect(uploadDocumentImage).toHaveBeenCalledTimes(2)
  })

  it('keeps a picture inline in both when its upload fails', async () => {
    uploadDocumentImage.mockRejectedValueOnce(new Error('bucket missing'))
    const html = `<img src="${uri(PNG_A)}">`
    const { content, content_json } = await prepareImportedContent('u1', html, doc(image(uri(PNG_A))))
    expect(content).toBe(html)
    expect(content_json).toEqual(doc(image(uri(PNG_A))))
  })

  it('drops the JSON when the clean-up changed the HTML text, so the two never disagree', async () => {
    const { content, content_json } = await prepareImportedContent('u1', '<p>a&nbsp;&nbsp;&nbsp;b</p>', doc({ type: 'paragraph' }))
    expect(content).toBe('<p>a b</p>')
    expect(content_json).toBeNull()
  })

  it('drops JSON over the stored size cap and keeps the HTML', async () => {
    const huge = doc({ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(EDITOR_JSON_MAX_CHARS) }] })
    const { content, content_json } = await prepareImportedContent('u1', '<p>x</p>', huge)
    expect(content).toBe('<p>x</p>')
    expect(content_json).toBeNull()
  })

  it('stores HTML alone when the converter wrote no JSON', async () => {
    expect(await prepareImportedContent('u1', '<p>x</p>', undefined)).toEqual({ content: '<p>x</p>', content_json: null })
  })
})

describe('withStoredImageSources', () => {
  it('leaves sources that are not stored, and everything else, as they were', () => {
    const value = doc(image('https://elsewhere/x.png'), { type: 'paragraph', attrs: { style: 'src: x' } })
    expect(withStoredImageSources(value, new Map([['k', 'https://cdn/a.png']]))).toEqual(value)
  })
})
