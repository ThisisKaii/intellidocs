import { getDocumentById } from '../../models/documentModel'
import { type Document } from '../../types'
import { type z } from 'zod'
import { getDocumentContentSchema } from '../../../schemas/mcpSchemas'

interface ToolContext {
  userId: string
}

const DEFAULT_PAGE_SIZE = 4000

/** Strip HTML tags and collapse whitespace into a single readable line. */
function toPlainText(content: string): string {
  return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Return a document for the AI. Whole documents can exceed the provider
 * context window, so content is split into page-sized chunks: callers pass
 * `page` (1-based) to pull just the pages they need.
 */
export async function getDocumentContent(
  ctx: ToolContext,
  args: z.infer<typeof getDocumentContentSchema>
): Promise<{
  id: string
  title: string
  excerpt: string
  page: number
  totalPages: number
  content: string
}> {
  const doc: Document = await getDocumentById(args.documentId, ctx.userId)
  const plainText = toPlainText(doc.content ?? '')

  const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(plainText.length / pageSize))
  const requestedPage = Math.min(Math.max(args.page ?? 1, 1), totalPages)
  const start = (requestedPage - 1) * pageSize

  return {
    id: doc.id,
    title: doc.title,
    excerpt: plainText.slice(0, 800),
    page: requestedPage,
    totalPages,
    content: plainText.slice(start, start + pageSize),
  }
}
