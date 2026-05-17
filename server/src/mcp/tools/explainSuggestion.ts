import { type z } from 'zod'
import { explainSuggestionSchema } from '../../../schemas/mcpSchemas'

export async function explainSuggestion(
  args: z.infer<typeof explainSuggestionSchema>
): Promise<{ explanation: string }> {
  const confidencePercent = Math.round(args.confidence * 100)
  const reason = args.reason ?? 'The model matched patterns in your recent formatting history.'

  return {
    explanation: `Suggested ${args.format} with ${confidencePercent}% confidence. ${reason}`,
  }
}
