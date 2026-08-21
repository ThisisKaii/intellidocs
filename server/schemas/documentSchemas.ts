import { z } from 'zod'

/** Page-number style options for headers/footers. */
export const pageNumberFormatSchema = z.enum(['none', 'number', 'roman'])

/** Page size presets supported by the editor. */
export const pageSizeSchema = z.enum(['short', 'long', 'a4', 'letter', 'legal'])

/** Page orientation. */
export const pageOrientationSchema = z.enum(['portrait', 'landscape'])

/** Page margins in inches (min 0.1, max 4). */
export const marginsSchema = z.object({
  top: z.number().min(0.1).max(4),
  bottom: z.number().min(0.1).max(4),
  left: z.number().min(0.1).max(4),
  right: z.number().min(0.1).max(4),
})

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
    content: z.string().max(8000000, 'Content is too large').optional(),
    header_content: z.string().max(5000, 'Header is too large').optional(),
    footer_content: z.string().max(5000, 'Footer is too large').optional(),
    show_header: z.boolean().optional(),
    show_footer: z.boolean().optional(),
    header_number_format: pageNumberFormatSchema.optional(),
    footer_number_format: pageNumberFormatSchema.optional(),
    page_size: pageSizeSchema.optional(),
    margins: marginsSchema.optional(),
    orientation: pageOrientationSchema.optional(),
    formatting_history: z.array(z.string()).max(500).optional(),
    is_isolated: z.boolean().optional(),
    formatting_preset: z.string().max(100).nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.content !== undefined ||
      data.header_content !== undefined ||
      data.footer_content !== undefined ||
      data.show_header !== undefined ||
      data.show_footer !== undefined ||
      data.header_number_format !== undefined ||
      data.footer_number_format !== undefined ||
      data.page_size !== undefined ||
      data.margins !== undefined ||
      data.orientation !== undefined ||
      data.formatting_history !== undefined ||
      data.is_isolated !== undefined ||
      data.formatting_preset !== undefined,
    {
      message: 'At least one field must be provided',
    }
  )

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>