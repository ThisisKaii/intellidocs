import { behaviorEventSchema } from '../../../schemas/behaviorSchemas'

describe('behaviorEventSchema', () => {
  it('keeps the legacy text-format payload fields', () => {
    const result = behaviorEventSchema.parse({
      action: 'bold',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: { text: 'hello', bold: true, fontSize: 12 },
    })

    expect(result.payload).toMatchObject({ text: 'hello', bold: true, fontSize: 12 })
  })

  // Zod strips unknown keys, so any structured-object field missing from the
  // schema would be dropped before the event reached Redis. These assertions
  // exist to fail loudly if someone narrows the payload again.
  it('preserves table shape fields', () => {
    const result = behaviorEventSchema.parse({
      action: 'insert_table',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: {
        contextNode: 'table',
        tableRows: 3,
        tableCols: 4,
        tableAlignment: 'center',
        tableHasHeader: true,
      },
    })

    expect(result.payload).toEqual({
      contextNode: 'table',
      tableRows: 3,
      tableCols: 4,
      tableAlignment: 'center',
      tableHasHeader: true,
    })
  })

  it('preserves image dimension and alignment fields', () => {
    const result = behaviorEventSchema.parse({
      action: 'image_resize',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: {
        contextNode: 'image',
        imageWidth: 400,
        imageHeight: 300,
        imageAlignment: 'float',
        imageHasCaption: false,
      },
    })

    expect(result.payload).toEqual({
      contextNode: 'image',
      imageWidth: 400,
      imageHeight: 300,
      imageAlignment: 'float',
      imageHasCaption: false,
    })
  })

  it('preserves callout, blockquote and code-block fields', () => {
    const result = behaviorEventSchema.parse({
      action: 'code_block_insert',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: { blockType: 'callout', blockIndent: 2, codeLanguage: 'python' },
    })

    expect(result.payload).toEqual({
      blockType: 'callout',
      blockIndent: 2,
      codeLanguage: 'python',
    })
  })

  it('accepts an event with no payload at all', () => {
    const result = behaviorEventSchema.parse({
      action: 'bold',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
    })

    expect(result.payload).toBeUndefined()
  })

  it('rejects an unknown image alignment', () => {
    const result = behaviorEventSchema.safeParse({
      action: 'image_alignment',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: { imageAlignment: 'diagonal' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects a negative table row count', () => {
    const result = behaviorEventSchema.safeParse({
      action: 'insert_table',
      timestamp: '2026-01-01T10:00:00.000Z',
      documentId: 'doc-1',
      payload: { tableRows: -1 },
    })

    expect(result.success).toBe(false)
  })

  it('rejects an event with no action', () => {
    expect(
      behaviorEventSchema.safeParse({
        timestamp: '2026-01-01T10:00:00.000Z',
        documentId: 'doc-1',
      }).success
    ).toBe(false)
  })

  it('rejects a malformed timestamp', () => {
    expect(
      behaviorEventSchema.safeParse({
        action: 'bold',
        timestamp: 'yesterday',
        documentId: 'doc-1',
      }).success
    ).toBe(false)
  })
})
