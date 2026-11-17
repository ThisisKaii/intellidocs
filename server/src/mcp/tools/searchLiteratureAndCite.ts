import { type z } from 'zod'
import { searchLiteratureAndCiteSchema } from '../../../schemas/mcpSchemas'
import { groundLiteratureCitations, type GroundedPaper } from '../../skills/groundLiteratureCitations'

/** Real papers from Crossref and Semantic Scholar; the client formats them in the requested style. */
export async function searchLiteratureAndCite(
  args: z.infer<typeof searchLiteratureAndCiteSchema>
): Promise<{ style: 'ieee' | 'apa'; papers: GroundedPaper[] }> {
  const papers = await groundLiteratureCitations({ query: args.query, claimText: args.claimText, limit: args.limit })
  return { style: args.style, papers }
}
