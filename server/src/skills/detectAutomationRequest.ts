import type { Automation } from './assistantCards'

/** "fix the figure numbering", "renumber the captions", "the table numbers are wrong". */
const RENUMBER_CAPTIONS =
  /\bre-?number\w*\b[^.?!]{0,30}\b(?:figures?|tables?|captions?)\b|\b(?:fix|correct|update|redo|repair|sort out)\b[^.?!]{0,30}\b(?:figure|table|caption)s?\s+(?:numbers|numbering)\b|\b(?:figure|table|caption)s?\s+(?:numbers|numbering)\b[^.?!]{0,20}\b(?:wrong|off|out of order|messed up|broken)\b/

/**
 * Automations a request names plainly enough for a fixed rule (no AI call). Everything else an
 * automation can do is reached through the AI fallback or /mcp.
 */
export function detectAutomationRequest(message: string): Automation | null {
  const text = message.toLowerCase().replace(/\s+/g, ' ').trim()
  if (RENUMBER_CAPTIONS.test(text)) return { action: 'renumberCaptions' }
  return null
}
