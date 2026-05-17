import { getDocumentById } from '../../models/documentModel'
import { type Document } from '../../types'
import { type z } from 'zod'
import { getDocumentContentSchema } from '../../../schemas/mcpSchemas'

interface ToolContext {
  userId: string
}

export async function getDocumentContent(
  ctx: ToolContext,
  args: z.infer<typeof getDocumentContentSchema>
): Promise<{ id: string; title: string; content: string; excerpt: string }> {
  const doc: Document = await getDocumentById(args.documentId, ctx.userId)
  const excerpt = doc.content?.slice(0, 800) ?? ''
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content ?? '',
    excerpt,
  }
}
