import { updateDocumentSchema } from '../../../schemas/documentSchemas'

describe('document title on update', () => {
  it('drops a blank title so the rest of the save (the text) still goes through', () => {
    const parsed = updateDocumentSchema.safeParse({ title: '   ', content: '<p>Typed while the title was empty.</p>' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.title).toBeUndefined()
    expect(parsed.success && parsed.data.content).toContain('Typed while')
  })

  it('keeps a real title, trimmed', () => {
    const parsed = updateDocumentSchema.safeParse({ title: '  Chapter 1  ' })
    expect(parsed.success && parsed.data.title).toBe('Chapter 1')
  })

  it('still refuses an overlong title', () => {
    expect(updateDocumentSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
  })
})
