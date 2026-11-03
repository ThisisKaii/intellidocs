import { EDITOR_JSON_MAX_CHARS, updateDocumentSchema } from '../../../schemas/documentSchemas'

const doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { style: 'padding: 0 5.4pt' } }] }

describe('updateDocumentSchema content_json', () => {
  it('accepts the editor JSON with the HTML and keeps node attributes untouched', () => {
    const parsed = updateDocumentSchema.parse({ content: '<p></p>', content_json: doc })
    expect(parsed.content_json).toEqual(doc)
  })

  it('accepts null JSON with the HTML', () => {
    expect(updateDocumentSchema.safeParse({ content: '<p></p>', content_json: null }).success).toBe(true)
  })

  it('rejects JSON sent without the HTML it belongs to', () => {
    expect(updateDocumentSchema.safeParse({ title: 'x', content_json: doc }).success).toBe(false)
  })

  it('rejects JSON that is not an editor document', () => {
    expect(updateDocumentSchema.safeParse({ content: '<p></p>', content_json: { type: 'paragraph' } }).success).toBe(false)
    expect(updateDocumentSchema.safeParse({ content: '<p></p>', content_json: [doc] }).success).toBe(false)
    expect(updateDocumentSchema.safeParse({ content: '<p></p>', content_json: { type: 'doc', content: 'text' } }).success).toBe(false)
  })

  it('rejects oversized JSON', () => {
    const huge = { type: 'doc', content: [{ type: 'text', text: 'x'.repeat(EDITOR_JSON_MAX_CHARS) }] }
    expect(updateDocumentSchema.safeParse({ content: '<p></p>', content_json: huge }).success).toBe(false)
  })
})
