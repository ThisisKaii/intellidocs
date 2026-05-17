import { getBehaviorEvents } from '../../models/behaviorModel'
import { type z } from 'zod'
import { getBehaviorSummarySchema } from '../../../schemas/mcpSchemas'

interface ToolContext {
  userId: string
}

export async function getBehaviorSummary(
  ctx: ToolContext,
  args: z.infer<typeof getBehaviorSummarySchema>
): Promise<{
  documentId: string
  totalEvents: number
  accepted: number
  rejected: number
}> {
  const events = await getBehaviorEvents(ctx.userId, args.documentId)
  const accepted = events.filter((e) => e.action.startsWith('chat_preview_accepted') || e.action.startsWith('auto_preview_accepted')).length
  const rejected = events.filter((e) => e.action.startsWith('chat_preview_rejected') || e.action.startsWith('auto_preview_rejected')).length

  return {
    documentId: args.documentId,
    totalEvents: events.length,
    accepted,
    rejected,
  }
}
