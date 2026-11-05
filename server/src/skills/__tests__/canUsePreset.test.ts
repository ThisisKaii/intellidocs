import { canUsePreset } from '../canUsePreset'

describe('canUsePreset', () => {
  it('locks thesis presets for baseline users', () => {
    expect(canUsePreset('user', 'uclm_capstone')).toBe(false)
    expect(canUsePreset('user', 'thesis')).toBe(false)
    expect(canUsePreset('user', 'uclm_capstone__v3')).toBe(false)
  })

  it.each(['student', 'professor', 'admin'] as const)('unlocks thesis presets for %s', (role) => {
    expect(canUsePreset(role, 'uclm_capstone')).toBe(true)
  })

  it('leaves every other preset open', () => {
    expect(canUsePreset('user', 'ieee')).toBe(true)
    expect(canUsePreset('user', 'apa_7th')).toBe(true)
    expect(canUsePreset('user', 'general')).toBe(true)
    expect(canUsePreset('user', null)).toBe(true)
  })
})
