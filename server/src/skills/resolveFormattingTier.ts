import { FormatBinding, FormatRule, TierCheckResult, TriggerCondition } from '../types/index'

export interface ResolveFormattingTierInput {
  text: string
  bindings: FormatBinding[]
  presetRules: FormatRule[]
}

/** Normalize a text block for condition matching. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Evaluate one trigger condition against a text block. */
export function matchesCondition(condition: TriggerCondition, text: string): boolean {
  const normalized = normalize(text)
  const words = normalized.length > 0 ? normalized.split(' ').length : 0
  const chars = normalized.length

  if (condition.maxWords !== undefined && words > condition.maxWords) {
    return false
  }

  if (condition.minWords !== undefined && words < condition.minWords) {
    return false
  }

  if (condition.maxChars !== undefined && chars > condition.maxChars) {
    return false
  }

  if (condition.standaloneLine && text.includes('\n')) {
    return false
  }

  if (condition.startsWith && !normalized.toLowerCase().startsWith(condition.startsWith.toLowerCase())) {
    return false
  }

  if (condition.contains && !normalized.toLowerCase().includes(condition.contains.toLowerCase())) {
    return false
  }

  return true
}

/**
 * Resolve the three-tier formatting decision for a text block:
 * 1. Custom bindings (highest priority, hard rules the user set).
 * 2. Active preset rules (when the document has a preset assigned).
 * 3. Otherwise return tier 'none' so the caller falls back to ML prediction.
 */
export function resolveFormattingTier(
  input: ResolveFormattingTierInput
): TierCheckResult {
  const { text, bindings, presetRules } = input

  // Tier 2 — custom bindings win over everything.
  const sortedBindings = [...bindings].sort((a, b) => b.priority - a.priority)
  for (const binding of sortedBindings) {
    if (matchesCondition(binding.trigger_condition, text)) {
      return {
        tier: 'binding',
        format: binding.format_to_apply,
        reason: `Custom binding matched (priority ${binding.priority}).`,
      }
    }
  }

  // Tier 1 — preset rules apply when no custom binding matched.
  const sortedPresets = [...presetRules].sort((a, b) => b.priority - a.priority)
  for (const rule of sortedPresets) {
    if (matchesCondition(rule.condition, text)) {
      return {
        tier: 'preset',
        format: rule.format,
        reason: 'Active preset rule matched.',
      }
    }
  }

  // Tier 3 — ML prediction is the fallback (handled by the caller).
  return { tier: 'none' }
}
