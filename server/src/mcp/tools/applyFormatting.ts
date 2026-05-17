import { appendBehaviorEvent } from '../../models/behaviorModel'
import { type z } from 'zod'
import { applyFormattingSchema } from '../../../schemas/mcpSchemas'

interface ToolContext {
  userId: string
}

export async function applyFormatting(
  ctx: ToolContext,
  args: z.infer<typeof applyFormattingSchema>
): Promise<{ status: string; format: string; mode: string; note: string }> {
  if (args.mode === 'preview') {
    return {
      status: 'preview',
      format: args.format,
      mode: args.mode,
      note: 'Preview only. Client must apply formatting after confirmation.',
    }
  }

  await appendBehaviorEvent(ctx.userId, {
    action: `mcp_format_applied:${args.format}`,
    timestamp: new Date().toISOString(),
    documentId: args.documentId,
  })

  return {
    status: 'committed',
    format: args.format,
    mode: args.mode,
    note: 'Formatting logged. Client should apply formatting to the editor.',
  }
}
