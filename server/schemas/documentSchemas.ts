import { z } from 'zod'

/** Validate document creation requests from HTTP clients. */
export const createDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
})

/** Validate document update requests from HTTP clients. */
export const updateDocumentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title must be 200 characters or fewer')
      .optional(),
    content: z.string().max(200000, 'Content is too large').optional(),
    formatting_history: z.array(z.string()).max(500).optional(),
    is_isolated: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.content !== undefined ||
      data.formatting_history !== undefined ||
      data.is_isolated !== undefined,
    {
      message: 'At least one field must be provided',
    }
  )

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>