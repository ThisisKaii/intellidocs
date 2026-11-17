import { describe, expect, it } from 'vitest'
import { mcpArgValue } from '../AIChatbot'

describe('mcpArgValue', () => {
  it('reads numbers, booleans, lists and JSON the way the tools expect them', () => {
    expect(mcpArgValue('fontSize', '12')).toBe(12)
    expect(mcpArgValue('fontSizeStep', '-2')).toBe(-2)
    expect(mcpArgValue('removeFormatting', 'true')).toBe(true)
    expect(mcpArgValue('formats', 'bold, italic')).toEqual(['bold', 'italic'])
    expect(mcpArgValue('kinds', 'table')).toEqual(['table'])
    expect(mcpArgValue('margins', '{"left":1.5}')).toEqual({ left: 1.5 })
    expect(mcpArgValue('targetCategory', 'except:tables')).toBe('except:tables')
  })

  it('keeps free text as typed, even when it looks like a number', () => {
    expect(mcpArgValue('sectionTitle', '1.2')).toBe('1.2')
    expect(mcpArgValue('text', 'true story')).toBe('true story')
  })
})
