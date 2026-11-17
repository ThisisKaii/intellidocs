import { aiChatRequestSchema } from '../../../schemas/aiSchemas'
import { TARGET_CATEGORIES } from '../../skills/parseFormattingIntent'

describe('aiChatRequestSchema lastPreview', () => {
  // The client sends the last preview back, so every category and mode the parser
  // can return must pass, or every follow-up message after it is rejected.
  it.each(TARGET_CATEGORIES)('accepts a previous preview of category %s', (targetCategory) => {
    expect(aiChatRequestSchema.safeParse({ message: 'yes', lastPreview: { targetCategory } }).success).toBe(true)
  })

  it.each(['literal', 'heading', 'section', 'title'])('accepts target mode %s', (targetMode) => {
    expect(aiChatRequestSchema.safeParse({ message: 'yes', lastPreview: { targetMode } }).success).toBe(true)
  })
})
