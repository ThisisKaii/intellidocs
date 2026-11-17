import { ZodError } from 'zod'
import { consumeAIQuota, refundAIQuota, type AIQuotaStatus } from '../models/aiQuotaModel'
import { cacheRoute, getCachedRoute, routeId } from '../models/assistantRouteModel'
import type { AssistantCard } from '../skills/assistantCards'
import { documentHasTarget } from '../skills/documentSections'
import { routeAssistantRequest, type RouteDecision, type RouteInput } from '../skills/routeAssistantRequest'
import { findTool, listTools, type ToolContext } from './toolRegistry'

/** Older tools the router never picks (formatBlocks does what they did, with a real preview). */
const NOT_ROUTABLE = new Set(['applyFormatting', 'applyBulkFormatting'])

export interface FallbackInput {
  userId: string
  email?: string
  message: string
  documentId?: string
  /** The open document's HTML, to check that a named section exists. */
  documentContent: string
  sectionTitles: string[]
  /** Changes the user rejected earlier in this chat. */
  rejected: string[]
}

export type FallbackResult =
  /** A change to confirm. `routeId` reports back whether it was applied. */
  | { kind: 'card'; card: AssistantCard; routeId: string; fromCache: boolean }
  /** Two or three readings, each a ready card; one tap picks one. */
  | { kind: 'clarify'; question: string; options: Array<{ label: string; card: AssistantCard }>; routeId: string }
  /** A plain answer instead of a change ("I couldn't find …"). */
  | { kind: 'answer'; reply: string }
  /** Not a request any tool handles: answer it as a question. */
  | { kind: 'none' }
  | { kind: 'quota'; quota: AIQuotaStatus }

/** The tools the router may choose, as its prompt lists them. */
export function routableTools(): Array<{ name: string; description: string; params: string }> {
  return listTools()
    .filter((tool) => tool.effect === 'plans' && !NOT_ROUTABLE.has(tool.name))
    .map(({ name, description, params }) => ({ name, description, params }))
}

/**
 * Run one tool the router chose and return its card, or null when the tool is not routable or
 * its own schema rejects the arguments. The document is filled in where a tool needs it.
 */
async function cardFor(ctx: ToolContext, tool: string, args: Record<string, unknown>, documentId: string | undefined): Promise<AssistantCard | null> {
  const found = NOT_ROUTABLE.has(tool) ? undefined : findTool(tool)
  if (!found || found.effect !== 'plans') return null
  const withDocument = tool === 'applyUsualFormatting' ? { ...args, documentId } : args
  try {
    const result = (await found.call(ctx, withDocument)) as { card?: AssistantCard }
    return result.card ?? null
  } catch (error) {
    // Why a pick was dropped (the tool and the check that failed, never the user's words).
    const issue = error instanceof ZodError ? error.issues.map((item) => `${item.path.join('.')}: ${item.message}`).join('; ') : 'tool error'
    console.warn(`[AI router] dropped ${tool}: ${issue}`)
    return null
  }
}

/** A named section the document does not have: say so instead of showing a change that does nothing. */
function missingTarget(card: AssistantCard, documentContent: string, sectionTitles: string[]): string | null {
  const preview = card.preview
  if (!preview?.target || preview.targetMode === 'literal') return null
  if (documentHasTarget(documentContent, preview.target, preview.targetMode ?? null)) return null
  const hint = sectionTitles.length > 0 ? ` The sections I can see are: ${sectionTitles.slice(0, 8).join(', ')}.` : ''
  return `I couldn’t find “${preview.target}” in this document.${hint}`
}

/**
 * The assistant's fallback for a request no fixed rule recognised: a cached route for the same
 * request costs nothing; otherwise the AI picks a tool (one quota unit). A question back, a miss,
 * or a pick the tool or the document rejects is refunded. Every result is still only a card.
 */
export async function runAssistantFallback(
  input: FallbackInput,
  route: (routeInput: RouteInput) => Promise<RouteDecision> = (routeInput) => routeAssistantRequest(routeInput)
): Promise<FallbackResult> {
  const ctx: ToolContext = { userId: input.userId, email: input.email }
  const id = routeId(input.message, input.sectionTitles)

  const cached = await getCachedRoute(input.userId, id)
  if (cached) {
    const card = await cardFor(ctx, cached.tool, cached.args, input.documentId)
    if (card && !missingTarget(card, input.documentContent, input.sectionTitles)) return { kind: 'card', card, routeId: id, fromCache: true }
  }

  const quota = await consumeAIQuota(input.userId, 'chat')
  if (!quota.allowed) return { kind: 'quota', quota }
  const refund = (): Promise<void> => refundAIQuota(input.userId, 'chat').catch(() => undefined)

  const decision = await route({ message: input.message, tools: routableTools(), sectionTitles: input.sectionTitles, rejected: input.rejected })

  if (decision.kind === 'tool') {
    const card = await cardFor(ctx, decision.tool, decision.args, input.documentId)
    if (!card) {
      await refund()
      return { kind: 'none' }
    }
    const missing = missingTarget(card, input.documentContent, input.sectionTitles)
    if (missing) {
      await refund()
      return { kind: 'answer', reply: missing }
    }
    await cacheRoute(input.userId, id, { message: input.message, tool: decision.tool, args: decision.args, confidence: decision.confidence })
    return { kind: 'card', card, routeId: id, fromCache: false }
  }

  await refund()
  if (decision.kind === 'none') return { kind: 'none' }

  const options: Array<{ label: string; card: AssistantCard }> = []
  for (const option of decision.options) {
    const card = await cardFor(ctx, option.tool, option.args, input.documentId)
    if (card && !missingTarget(card, input.documentContent, input.sectionTitles)) options.push({ label: option.label, card })
  }
  // A question with nothing valid to pick is still worth asking, as a plain answer.
  if (options.length === 0) return { kind: 'answer', reply: decision.question }
  return { kind: 'clarify', question: decision.question, options, routeId: id }
}
