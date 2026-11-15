/**
 * The chat assistant's "apply without asking" mode.
 *
 * Normally every change the assistant proposes waits for Apply / Reject. A user can tell it to go
 * ahead on its own ("you have my permission", "do it without asking"); the chat then asks once,
 * with a warning that the assistant will be making formatting decisions by itself, and turns the
 * mode on only when the user confirms. "Ask me first" (or the switch in Settings) turns it off.
 */

export type AutonomyRequest = 'grant' | 'revoke'

/** Phrases that take the permission back. Checked first: "don't apply without asking" is one. */
const REVOKE: RegExp[] = [
  /\b(?:ask|check with)\s+me\s+(?:first|before)\b/i,
  /\b(?:turn\s+off|disable|stop|switch\s+off)\s+(?:the\s+)?(?:auto(?:matic)?(?:[\s-]*(?:apply|applying|mode|edits?))?|autonomous(?:\s+mode)?|applying\s+(?:changes\s+)?(?:automatically|on\s+your\s+own|by\s+yourself))\b/i,
  /\b(?:don'?t|do\s+not|never)\s+(?:apply|change|edit|format)\s+(?:anything\s+)?without\s+(?:asking|my\s+(?:permission|approval|ok))/i,
  /\b(?:i\s+)?(?:take\s+back|revoke)\s+(?:my\s+|the\s+)?permission\b/i,
]

/** Phrases that give the assistant permission to change the document without asking. */
const GRANT: RegExp[] = [
  /\byou\s+(?:have|got|now\s+have)\s+(?:my\s+|full\s+)?(?:permission|approval|consent)\b/i,
  /\bi\s+(?:give|grant)\s+you\s+(?:my\s+|full\s+)?(?:permission|approval)\b/i,
  /\byou(?:'re|\s+are)\s+(?:allowed|free|authori[sz]ed)\s+to\s+(?:apply|edit|change|format|do)/i,
  /\b(?:without|no\s+need\s+(?:to|for)|don'?t\s+need\s+to|do\s+not\s+need\s+to|stop|quit)\s+(?:asking|ask(?:ing)?\s+(?:me|for\s+(?:my\s+)?permission|first)|(?:my\s+)?(?:permission|approval|confirmation)|confirm(?:ing)?)\b/i,
  /\b(?:don'?t|do\s+not)\s+(?:ask|wait\s+for)\s+(?:me|for\s+(?:my\s+)?(?:permission|approval)|first)\b/i,
  /\b(?:apply|do|make|edit|change|format)\s+(?:it|them|that|this|the\s+changes?|changes|everything|things)?\s*(?:directly|automatically|yourself|on\s+your\s+own|by\s+yourself)\b/i,
  /\b(?:turn\s+on|enable|switch\s+on|use)\s+(?:the\s+)?(?:auto(?:matic)?[\s-]*(?:apply|mode|edits?)|autonomous(?:\s+mode)?)\b/i,
]

/** What a chat message asks of the mode, if anything. */
export function detectAutonomyRequest(message: string): AutonomyRequest | null {
  if (REVOKE.some((pattern) => pattern.test(message))) return 'revoke'
  if (GRANT.some((pattern) => pattern.test(message))) return 'grant'
  return null
}

/**
 * Whether a message that grants or revokes permission also asks for something else ("you can
 * do it without asking: make the headings bold"), so it still goes to the assistant.
 */
export function asksForMoreThanPermission(message: string): boolean {
  let rest = message
  for (const pattern of [...REVOKE, ...GRANT]) rest = rest.replace(new RegExp(pattern.source, 'gi'), ' ')
  rest = rest
    .replace(/\b(?:ok(?:ay)?|yes|yeah|sure|please|pls|just|now|go\s+ahead|from\s+now\s+on|you\s+can|you\s+may|and|so|then|it'?s\s+fine|it\s+is\s+fine|again|anymore)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
  return rest.split(/\s+/).filter((word) => word.length > 1).length >= 3
}

/** Shown before the mode is turned on, and next to the switch in Settings. */
export const AUTONOMY_WARNING =
  'I will apply my changes to the document right away instead of waiting for your Apply. I will be deciding on my own, so I may make inaccurate or bad formatting choices. You can undo any change ("undo that" or Ctrl+Z) and turn this off at any time here or in Settings → Editor & AI.'
