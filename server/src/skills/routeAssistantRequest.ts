import { z } from 'zod'
import { aiClient, type ChatCompleter } from '../ai/aiClient'
import { parseModelJson } from '../ai/parseModelJson'
import { buildRouterPrompt, type RouterTool } from '../ai/prompts/systemPrompts'

/** What the router decided a request means. Every tool call is still checked by the tool itself. */
export type RouteDecision =
  | { kind: 'tool'; tool: string; args: Record<string, unknown>; confidence: number }
  | { kind: 'clarify'; question: string; options: Array<{ label: string; tool: string; args: Record<string, unknown> }> }
  | { kind: 'none'; reason: string }

export interface RouteInput {
  message: string
  tools: RouterTool[]
  sectionTitles: string[]
  /** Changes the user rejected earlier in this chat, by name. */
  rejected: string[]
}

/** Below this the router's pick is not trusted enough to show as a change. */
export const MIN_ROUTE_CONFIDENCE = 0.5
const MAX_MESSAGE_CHARS = 600

const argsSchema = z.record(z.unknown())
const replySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tool'), tool: z.string().min(1).max(64), args: argsSchema.default({}), confidence: z.number().min(0).max(1).default(0.7) }),
  z.object({
    action: z.literal('clarify'),
    question: z.string().min(3).max(300),
    options: z.array(z.object({ label: z.string().min(1).max(120), tool: z.string().min(1).max(64), args: argsSchema.default({}) })).max(3).default([]),
  }),
  z.object({ action: z.literal('none'), reason: z.string().max(300).default('') }),
])

/**
 * Ask the model which tool a request the fixed rules did not recognise means. The prompt holds
 * only the request, the tool list, the section titles and what was rejected: never the document
 * text. Unknown tools, low confidence and replies that are not the expected JSON all come back as
 * `none`, so a bad reply can never become a change.
 */
export async function routeAssistantRequest(
  input: RouteInput,
  complete: ChatCompleter = (messages, systemPrompt) => aiClient.chatPreferring(routerProfile(), messages, systemPrompt)
): Promise<RouteDecision> {
  const known = new Set(input.tools.map((tool) => tool.name))
  let reply: string
  try {
    reply = (await complete([{ role: 'user', content: input.message.slice(0, MAX_MESSAGE_CHARS) }], buildRouterPrompt(input.tools, input.sectionTitles, input.rejected))).text
  } catch {
    return { kind: 'none', reason: 'The assistant could not be reached.' }
  }
  const parsed = replySchema.safeParse(parseModelJson(reply))
  if (!parsed.success) return { kind: 'none', reason: 'The reply was not a tool choice.' }
  const decision = parsed.data
  if (decision.action === 'none') return { kind: 'none', reason: decision.reason }
  if (decision.action === 'clarify') {
    const options = decision.options.filter((option) => known.has(option.tool))
    return { kind: 'clarify', question: decision.question, options }
  }
  if (!known.has(decision.tool)) return { kind: 'none', reason: `No tool called ${decision.tool}.` }
  if (decision.confidence < MIN_ROUTE_CONFIDENCE) return { kind: 'none', reason: 'Not sure enough what was meant.' }
  return { kind: 'tool', tool: decision.tool, args: decision.args, confidence: decision.confidence }
}

/** Words of an editing command (stems, so "centre", "headres" and "captioning" match too). */
const COMMAND_WORDS =
  /\b(?:make|set|change|format|turn|put|use|fix|add|apply|remove|undo|clear|caption|number|renumber|indent|spac|align|cent(?:er|re)|justif|bold|unbold|italic|underlin|font|size|pt\b|bigger|smaller|larger|tiny|huge|margin|page|landscape|portrait|a4|letter|preset|apa|ieee|style|head|title|paragraph|para|list|bullet|table|figure|picture|image|reference|bibliograph|citation|chapter|section)/i

/**
 * Whether a message the fixed rules did not recognise is worth routing: it sounds like an
 * editing command and is not a long paste. "Thanks!" and "hello" go straight to the chat answer,
 * without an extra AI call.
 */
export function looksLikeCommand(message: string): boolean {
  return message.length <= MAX_MESSAGE_CHARS && COMMAND_WORDS.test(message)
}

/** AI_ROUTER_PROFILE: the configured model (AI_PROVIDER_<n>) to try first for routing. */
function routerProfile(): number | undefined {
  const value = Number(process.env.AI_ROUTER_PROFILE)
  return Number.isInteger(value) && value >= 1 ? value : undefined
}

/** "every pic", "all my charts": a group named with all / every / each. */
const QUANTIFIED_GROUP =
  /\b(?:all|every|each)\s+(?:of\s+)?(?:the\s+|my\s+|these\s+|those\s+)?(?!(?:this|that|it|them|these|those|of|bold|italics?|underlined?|caps|capitals?|uppercase|lowercase|cent(?:er|re)d?|justified|right|left|same|together|bigger|smaller|larger|the\s+same)\b)[a-z]{2,}/i

/**
 * Whether a request names a group ("center every pic") that the fixed rules read only as a change
 * to the selection: such a reading would quietly change the wrong text, so the AI decides instead.
 * Call it only for a fixed-rule reading that applies to the selection.
 */
export function namesUnknownGroup(message: string): boolean {
  return QUANTIFIED_GROUP.test(message) || NAMED_PLACE.test(message)
}

/** "page 3", "this page", "the top of", "at the end of": a place the fixed rules did not resolve. */
const NAMED_PLACE = /\bpage\s+\d{1,4}\b|\b(?:this|current|next|previous|last)\s+page\b|\b(?:top|bottom|start|end|middle|beginning)\s+of\b/i
