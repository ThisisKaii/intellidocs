import { appendBehaviorEvent } from '../../models/behaviorModel'
import { type z } from 'zod'
import { applyBulkFormattingSchema } from '../../../schemas/mcpSchemas'

interface ToolContext {
  userId: string
}

export async function applyBulkFormatting(
  ctx: ToolContext,
  args: z.infer<typeof applyBulkFormattingSchema>
): Promise<{ status: string; format: string; mode: string; targetCount: number; note: string }> {
  if (args.mode === 'preview') {
    return {
      status: 'preview',
      format: args.format,
      mode: args.mode,
      targetCount: args.targets.length,
      note: `Preview only — ${args.targets.length} target range(s) will be reformatted after confirmation.`,
    }
  }

  const timestamp = new Date().toISOString()

  // Log one behavior event per target range so the learning loop records
  // the exact scope of the bulk edit.
  for (const target of args.targets) {
    await appendBehaviorEvent(ctx.userId, {
      action: `mcp_bulk_format_applied:${args.format}`,
      timestamp,
      documentId: args.documentId,
      payload: { from: target.from, to: target.to },
    })
  }

  return {
    status: 'committed',
    format: args.format,
    mode: args.mode,
    targetCount: args.targets.length,
    note: `Bulk formatting logged for ${args.targets.length} range(s). Client should apply formatting to the editor.`,
  }
}