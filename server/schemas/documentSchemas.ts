import { z } from 'zod'

/** Body of "join with a share code": what the person typed (the controller normalises it). */
export const joinCodeSchema = z.object({
  code: z.string().trim().min(1, 'Enter a code').max(30, 'That code is too long'),
})

/** The `:id` of a document route. */
export const documentIdParamSchema = z.object({
  id: z.string().uuid('Invalid document id'),
})

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

/** One section's header/footer choice and numbering (see PageLayout). */
const pageLayoutSectionSchema = z.object({
  index: z.number().int().min(0),
  header: z.string().nullable(),
  footer: z.string().nullable(),
  first_header: z.string().nullable(),
  first_footer: z.string().nullable(),
  title_pg: z.boolean(),
  number_start: z.number().int().nullable(),
  number_format: z.string().max(40),
  header_distance: z.number(),
  footer_distance: z.number(),
})

/** Header/footer art, per-section headers and page numbering saved with a document. */
export const pageLayoutBaseSchema = z.object({
    sections: z.array(pageLayoutSectionSchema).max(500),
    parts: z.record(z.string().max(20), z.object({ flow: z.string(), art: z.string() })),
    repeat_art: z.string(),
    page_art: z.record(z.string().max(10), z.string()),
    overlays: z
      .record(
        z.string().max(10),
        z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), behind: z.boolean(), html: z.string() }),
      )
      .optional(),
    flow_rules: z.boolean().optional(),
    two_column: z.boolean().optional(),
})

export const pageLayoutSchema = pageLayoutBaseSchema.refine(
  (layout) => JSON.stringify(layout).length <= 2_000_000,
  { message: 'Page layout is too large' },
)

/** Validate document creation requests from HTTP clients. */
export const createDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  // Blueprint seeding: the new-document modal sends the rendered skeleton and
  // the preset key to bind, so the document opens already structured.
  content: z.string().max(500000, 'Content must be 500000 characters or fewer').optional(),
  formatting_preset: z.string().trim().max(100).optional(),
  unique_title: z.boolean().optional(),
})

/** One saved reference; unknown keys are dropped so only the form's fields are stored. */
const citationReferenceSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['journal', 'book', 'conference', 'website', 'thesis', 'report', 'other']),
  authors: z.array(z.string().max(200)).max(50),
  title: z.string().max(500),
  year: z.number().int().min(0).max(3000),
  venue: z.string().max(300).optional(),
  volume: z.string().max(40).optional(),
  issue: z.string().max(40).optional(),
  pages: z.string().max(40).optional(),
  doi: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
  publisher: z.string().max(200).optional(),
  cited: z.number().int().min(1).max(10000).optional(),
})

/** The document's citation style and reference list. */
const citationDataSchema = z.object({
  style: z.enum(['ieee', 'apa', 'mla', 'chicago']),
  references: z.array(citationReferenceSchema).max(500),
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
    header_content: z.string().max(1_000_000, 'Header is too large').optional(),
    footer_content: z.string().max(1_000_000, 'Footer is too large').optional(),
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
    citation_data: citationDataSchema.optional(),
    page_layout: pageLayoutSchema.nullable().optional(),
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
      data.formatting_preset !== undefined ||
      data.citation_data !== undefined ||
      data.page_layout !== undefined,
    {
      message: 'At least one field must be provided',
    }
  )

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>