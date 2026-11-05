import { describe, expect, it } from 'vitest'
import { canUsePreset } from './presetAccess'

describe('canUsePreset', () => {
  it('locks thesis presets (and their forks) for baseline users', () => {
    expect(canUsePreset('user', 'uclm_capstone')).toBe(false)
    expect(canUsePreset('user', 'uclm_capstone__v2')).toBe(false)
    expect(canUsePreset(undefined, 'thesis')).toBe(false)
  })

  it('unlocks them for verified roles', () => {
    expect(canUsePreset('student', 'uclm_capstone')).toBe(true)
    expect(canUsePreset('professor', 'thesis')).toBe(true)
  })

  it('leaves other presets open', () => {
    expect(canUsePreset('user', 'ieee')).toBe(true)
    expect(canUsePreset('user', null)).toBe(true)
  })
})
