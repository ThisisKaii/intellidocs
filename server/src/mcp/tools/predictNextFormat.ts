import { predictFormat } from '../../skills/predictFormat'
import { type z } from 'zod'
import { predictNextFormatSchema } from '../../../schemas/mcpSchemas'

export async function predictNextFormat(
  args: z.infer<typeof predictNextFormatSchema>
): Promise<{ predictedFormat: string; confidence: number }> {
  const result = await predictFormat({ text: args.text })
  return {
    predictedFormat: result.predictedFormat,
    confidence: result.confidence,
  }
}
