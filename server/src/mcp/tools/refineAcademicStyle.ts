import { type z } from 'zod'
import { refineAcademicStyleSchema } from '../../../schemas/mcpSchemas'
import { refineAcademicTone, type ToneRefinement } from '../../skills/refineAcademicTone'

/** Suggested edits to the user's own text, each applied only when the user accepts it. */
export async function refineAcademicStyle(
  args: z.infer<typeof refineAcademicStyleSchema>
): Promise<ToneRefinement & { sourceText: string }> {
  const result = await refineAcademicTone({ text: args.text, focus: args.focus })
  return { ...result, sourceText: args.text }
}
