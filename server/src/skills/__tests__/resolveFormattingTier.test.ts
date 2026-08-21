import { resolveFormattingTier } from '../resolveFormattingTier'
import { FormatBinding, FormatRule } from '../../types/index'

describe('resolveFormattingTier', () => {
  const bindings: FormatBinding[] = [
    {
      id: 'b1',
      user_id: 'u1',
      trigger_condition: { maxWords: 5, standaloneLine: true },
      format_to_apply: 'heading2',
      priority: 10,
      created_at: '',
    },
    {
      id: 'b2',
      user_id: 'u1',
      trigger_condition: { startsWith: 'Dear' },
      format_to_apply: 'paragraph',
      priority: 20,
      created_at: '',
    },
  ]

  const presetRules: FormatRule[] = [
    { condition: { startsWith: 'Chapter' }, format: 'heading1', priority: 20 },
    { condition: { maxWords: 8, standaloneLine: true }, format: 'heading2', priority: 10 },
  ]

  it('returns a custom binding match before preset rules', () => {
    const result = resolveFormattingTier({
      text: 'Short title',
      bindings,
      presetRules,
    })

    expect(result.tier).toBe('binding')
    expect(result.format).toBe('heading2')
  })

  it('honors binding priority when multiple bindings match', () => {
    const result = resolveFormattingTier({
      text: 'Dear John',
      bindings,
      presetRules,
    })

    expect(result.tier).toBe('binding')
    expect(result.format).toBe('paragraph')
  })

  it('falls back to a preset rule when no binding matches', () => {
    const result = resolveFormattingTier({
      text: 'Chapter 5: Methods and Results Explained',
      bindings,
      presetRules,
    })

    expect(result.tier).toBe('preset')
    expect(result.format).toBe('heading1')
  })

  it('returns tier none when nothing matches', () => {
    const result = resolveFormattingTier({
      text: 'This is a full paragraph with many words that keeps going.',
      bindings,
      presetRules,
    })

    expect(result.tier).toBe('none')
  })

  it('does not match standaloneLine conditions against multi-line text', () => {
    const result = resolveFormattingTier({
      text: 'Short line\nsecond line',
      bindings: [bindings[0]],
      presetRules: [],
    })

    expect(result.tier).toBe('none')
  })
})
