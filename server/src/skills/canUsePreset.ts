import { RoleName } from '../types/index'

/** Thesis presets are a verified-student perk: baseline `user` accounts must verify first. */
const THESIS_PRESETS = new Set(['uclm_capstone', 'thesis'])

/** Roles that may apply thesis presets. */
const THESIS_ROLES: readonly RoleName[] = ['student', 'professor', 'admin']

/** The code clients use to show the "verify as a student to unlock" notice. */
export const PRESET_LOCKED_CODE = 'preset_requires_verification'

/**
 * Whether a role may apply a formatting preset. Forked presets (`uclm_capstone__v2`) follow
 * their base key; every other preset is open to all roles.
 */
export function canUsePreset(role: RoleName, presetKey: string | null | undefined): boolean {
  if (!presetKey) return true
  const base = presetKey.split('__')[0]
  return !THESIS_PRESETS.has(base) || THESIS_ROLES.includes(role)
}
