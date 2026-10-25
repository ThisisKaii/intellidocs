import { grammarCheckSchema } from '../../../schemas/predictionSchemas'

describe('grammarCheckSchema', () => {
  it('accepts the legacy plain text body', () => {
    expect(grammarCheckSchema.safeParse({ text: 'Hello there.' }).success).toBe(true)
  })

  it('accepts blocks and fills metadata defaults', () => {
    const parsed = grammarCheckSchema.parse({ blocks: [{ text: 'A Proposal Project' }] })
    expect(parsed.blocks?.[0]).toEqual({
      text: 'A Proposal Project',
      kind: 'paragraph',
      align: 'left',
      centered: false,
    })
  })

  it('rejects an empty body and blank blocks', () => {
    expect(grammarCheckSchema.safeParse({}).success).toBe(false)
    expect(grammarCheckSchema.safeParse({ blocks: [{ text: '  ' }] }).success).toBe(false)
  })

  it('rejects unknown block kinds', () => {
    const result = grammarCheckSchema.safeParse({ blocks: [{ text: 'x', kind: 'table' }] })
    expect(result.success).toBe(false)
  })

  it('rejects blocks totalling over 50k characters', () => {
    const blocks = [{ text: 'a'.repeat(30000) }, { text: 'b'.repeat(30000) }]
    expect(grammarCheckSchema.safeParse({ blocks }).success).toBe(false)
  })
})
