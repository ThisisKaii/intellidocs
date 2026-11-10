import { updateDocumentSchema } from '../../../schemas/documentSchemas'

describe('updateDocumentSchema: pins', () => {
  it('accepts an update that only pins or unpins', () => {
    expect(updateDocumentSchema.safeParse({ is_pinned: true }).success).toBe(true)
    expect(updateDocumentSchema.safeParse({ is_pinned: false }).success).toBe(true)
  })

  it('rejects a pin that is not a boolean', () => {
    expect(updateDocumentSchema.safeParse({ is_pinned: 'yes' }).success).toBe(false)
  })

  it('still rejects an empty update', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false)
  })
})
