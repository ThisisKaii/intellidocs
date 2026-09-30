import { createUserPresetSchema } from '../../../schemas/formattingSchemas'
import { createDocumentSchema } from '../../../schemas/documentSchemas'

describe('createUserPresetSchema', () => {
  it('accepts a bare fork request with only the base key', () => {
    const result = createUserPresetSchema.parse({ baseKey: 'apa_7th' })

    expect(result.baseKey).toBe('apa_7th')
    expect(result.name).toBeUndefined()
    expect(result.rules).toBeUndefined()
  })

  it('trims the base key so a padded value still resolves', () => {
    expect(createUserPresetSchema.parse({ baseKey: '  ieee  ' }).baseKey).toBe('ieee')
  })

  it('rejects a fork with no base key', () => {
    expect(createUserPresetSchema.safeParse({}).success).toBe(false)
    expect(createUserPresetSchema.safeParse({ baseKey: '   ' }).success).toBe(false)
  })

  it('accepts a full fork with an explicit name and rule overrides', () => {
    const result = createUserPresetSchema.parse({
      baseKey: 'apa_7th',
      name: 'APA 7th Edition (Custom v2)',
      description: 'Double-spaced body, single-spaced block quotes',
      rules: [
        { format: 'bold' },
        { format: 'italic', priority: 2, condition: { maxWords: 12 } },
      ],
    })

    expect(result.name).toBe('APA 7th Edition (Custom v2)')
    expect(result.rules).toHaveLength(2)
    expect(result.rules?.[1].condition?.maxWords).toBe(12)
  })

  it('rejects a rule with no format to apply', () => {
    const result = createUserPresetSchema.safeParse({
      baseKey: 'apa_7th',
      rules: [{ priority: 1 }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a name longer than the column allows', () => {
    expect(
      createUserPresetSchema.safeParse({ baseKey: 'apa_7th', name: 'x'.repeat(121) }).success
    ).toBe(false)
  })

  it('rejects an oversized rule list', () => {
    const rules = Array.from({ length: 201 }, () => ({ format: 'bold' }))

    expect(createUserPresetSchema.safeParse({ baseKey: 'apa_7th', rules }).success).toBe(false)
  })
})

describe('createDocumentSchema with a blueprint', () => {
  it('accepts a plain title with no blueprint content', () => {
    const result = createDocumentSchema.parse({ title: 'Untitled' })

    expect(result.title).toBe('Untitled')
    expect(result.content).toBeUndefined()
    expect(result.formatting_preset).toBeUndefined()
  })

  it('accepts seeded blueprint content with a preset key', () => {
    const result = createDocumentSchema.parse({
      title: 'Untitled APA 7th Edition document',
      content: '<h1 data-guide="Title">Your Paper Title</h1>',
      formatting_preset: 'apa_7th',
    })

    expect(result.content).toContain('data-guide')
    expect(result.formatting_preset).toBe('apa_7th')
  })

  it('rejects blueprint content past the size guard', () => {
    const result = createDocumentSchema.safeParse({ title: 'Huge', content: 'x'.repeat(500001) })

    expect(result.success).toBe(false)
  })

  it('rejects an over-long preset key', () => {
    expect(
      createDocumentSchema.safeParse({ title: 'Untitled', formatting_preset: 'x'.repeat(101) })
        .success
    ).toBe(false)
  })
})
