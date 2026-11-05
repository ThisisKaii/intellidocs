import { predictFormat } from '../../skills/predictFormat'
import { type z } from 'zod'
import { predictNextFormatSchema } from '../../../schemas/mcpSchemas'

export async function predictNextFormat(
  args: z.infer<typeof predictNextFormatSchema>
): Promise<{ predictedFormat: string; confidence: number }> {
  // No user and no document: the neutral 'general' partition with no personal data.
  const result = await predictFormat({ text: args.text, genre: 'general' })
  return {
    predictedFormat: result.predictedFormat,
    confidence: result.confidence,
  }
}
