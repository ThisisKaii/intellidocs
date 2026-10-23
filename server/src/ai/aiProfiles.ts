export type AIProvider = 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'nvidia'

/** One configured AI backend: a provider, a model, and one or more API keys. */
export interface AIProfile {
  provider: AIProvider
  model: string
  apiKeys: string[]
}

/** The five council judges, in the order their env names are built (COUNCIL_<ROLE>_PROFILE). */
export const COUNCIL_ROLES = [
  'stylometric_linguist',
  'forensic_historian',
  'attribution_scholar',
  'paraphrase_detective',
  'synthesizer_arbiter',
] as const

export type CouncilRole = (typeof COUNCIL_ROLES)[number]

const KNOWN_PROVIDERS: AIProvider[] = ['gemini', 'groq', 'openrouter', 'mistral', 'nvidia']
const MAX_PROFILES = 9

/** Split a comma-separated key list ("key1,key2") into trimmed, non-empty keys. */
function splitKeys(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
}

/** Env variable name for profile `n`: AI_PROVIDER, AI_PROVIDER_2, AI_PROVIDER_3, ... */
function envName(base: 'AI_PROVIDER' | 'AI_API_KEY' | 'AI_MODEL', n: number): string {
  return n === 1 ? base : `${base}_${n}`
}

/** Read the profile for slot `n` (1-based); null when any of its three values is missing. */
function readProfile(env: NodeJS.ProcessEnv, n: number): AIProfile | null {
  const provider = env[envName('AI_PROVIDER', n)]?.trim().toLowerCase() as AIProvider | undefined
  const model = env[envName('AI_MODEL', n)]?.trim()
  const apiKeys = splitKeys(env[envName('AI_API_KEY', n)])
  if (!provider || !model || apiKeys.length === 0) return null
  if (!KNOWN_PROVIDERS.includes(provider)) return null
  return { provider, model, apiKeys }
}

/**
 * Every configured AI profile in priority order. Profile 1 is the classic
 * AI_PROVIDER / AI_MODEL / AI_API_KEY triple and is required (a clear error names
 * what is missing); profiles 2..9 use the same names with a numeric suffix and
 * are skipped when incomplete. Extra profiles serve as failover for the chatbot
 * and as additional judges for the council.
 */
export function getAIProfiles(env: NodeJS.ProcessEnv = process.env): AIProfile[] {
  if (!env.AI_PROVIDER) throw new Error('AI_PROVIDER is not set')
  if (!env.AI_MODEL) throw new Error('AI_MODEL is not set')
  if (splitKeys(env.AI_API_KEY).length === 0) throw new Error('AI_API_KEY is not set')

  const primary = readProfile(env, 1)
  if (!primary) throw new Error(`AI_PROVIDER must be one of: ${KNOWN_PROVIDERS.join(', ')}`)

  const profiles = [primary]
  for (let n = 2; n <= MAX_PROFILES; n += 1) {
    const extra = readProfile(env, n)
    if (extra) profiles.push(extra)
  }
  return profiles
}

/**
 * Which profile (0-based index into getAIProfiles) each council judge uses first.
 * COUNCIL_<ROLE>_PROFILE=<n> (1-based) pins a judge; otherwise the four
 * specialists are spread round-robin across the profiles and the arbiter uses
 * profile 1. With a single profile every judge gets index 0, as before.
 */
export function resolveJudgeAssignments(
  profileCount: number,
  env: NodeJS.ProcessEnv = process.env
): Record<CouncilRole, number> {
  const assignments = {} as Record<CouncilRole, number>
  COUNCIL_ROLES.forEach((role, position) => {
    const pinned = Number(env[`COUNCIL_${role.toUpperCase()}_PROFILE`])
    const isPinned = Number.isInteger(pinned) && pinned >= 1 && pinned <= profileCount
    const isArbiter = role === 'synthesizer_arbiter'
    assignments[role] = isPinned ? pinned - 1 : isArbiter ? 0 : position % Math.max(profileCount, 1)
  })
  return assignments
}
