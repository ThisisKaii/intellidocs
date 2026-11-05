import type { RoleName } from '@/types/admin'

/** Thesis presets are a verified-student perk (mirrors server skills/canUsePreset.ts). */
const THESIS_PRESETS = new Set(['uclm_capstone', 'thesis'])
const THESIS_ROLES: readonly RoleName[] = ['student', 'professor', 'admin']

/** Whether a role may use a preset; forks (`uclm_capstone__v2`) follow their base key. */
export function canUsePreset(role: RoleName | undefined, presetKey: string | null | undefined): boolean {
  if (!presetKey) return true
  const base = presetKey.split('__')[0]
  return !THESIS_PRESETS.has(base) || THESIS_ROLES.includes(role ?? 'user')
}
