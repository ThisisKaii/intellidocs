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
export const pageNumberFormatSchema = z.enum(['none', 'number', 'roman', 'manuscript'])

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
    /** Where the writer placed the imported header/footer lines (Left / Center / Right / Split). */
    placement: z
      .object({
        header: z.enum(['left', 'center', 'right', 'split']).optional(),
        footer: z.enum(['left', 'center', 'right', 'split']).optional(),
      })
      .optional(),
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

/** Largest editor JSON accepted, in serialised characters (matches the HTML cap). */
export const EDITOR_JSON_MAX_CHARS = 8_000_000

/**
 * The editor's own document (ProseMirror `editor.getJSON()`). Only the root is checked here: node
 * shapes belong to the editor's schema, which validates them when it loads the JSON.
 */
export const editorJsonShapeSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.unknown()).optional(),
  })
  .passthrough()

/** Editor JSON as clients send it: the document shape within the stored size cap. */
export const editorJsonSchema = editorJsonShapeSchema
  .refine((doc) => JSON.stringify(doc).length <= EDITOR_JSON_MAX_CHARS, {
    message: 'Content JSON is too large',
  })

export type EditorJson = z.infer<typeof editorJsonSchema>

/** How one kind of caption is written (frontend captionNumbering.CaptionKindConfig). */
const captionKindConfigSchema = z
  .object({
    placement: z.enum(['top', 'bottom']),
    label: z.enum(['Figure', 'Fig.', 'FIGURE', 'Table', 'TABLE', 'Tab.']),
    numerals: z.enum(['arabic', 'roman']),
    separator: z.enum([': ', '. ', ' — ', 'line']),
    fontFamily: z.string().max(100).optional(),
    fontSize: z.string().max(10).regex(/^(\d+(\.\d+)?pt)?$/),
    boldLabel: z.boolean(),
    italicText: z.boolean(),
    alignment: z.enum(['center', 'left']),
  })
  .strict()

/** A document's own caption settings (Page Setup → Captions, migration 051); null follows the preset. */
export const captionConfigSchema = z.object({ figure: captionKindConfigSchema, table: captionKindConfigSchema }).strict()

/** Validate document update requests from HTTP clients. */
export const updateDocumentSchema = z
  .object({
    // A cleared title field keeps the current title: refusing it would refuse the whole save,
    // text included, every time the editor autosaves while the field is empty.
    title: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().max(200, 'Title must be 200 characters or fewer').optional(),
    ),
    content: z.string().max(8000000, 'Content is too large').optional(),
    // The editor's JSON of the same content. Sent only together with `content`, so the two cannot
    // disagree; an update of `content` without it clears the stored JSON (see documentModel).
    content_json: editorJsonSchema.nullable().optional(),
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
    caption_config: captionConfigSchema.nullable().optional(),
  })
  .refine((data) => data.content_json === undefined || data.content !== undefined, {
    message: 'content_json must be sent together with content',
    path: ['content_json'],
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
      data.page_layout !== undefined ||
      data.caption_config !== undefined,
    {
      message: 'At least one field must be provided',
    }
  )

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
// ── Document tabs (migration 048) ───────────────────────────────────────────

/** `:id` and `:tabId` of a tab route. */
export const documentTabParamsSchema = z.object({
  id: z.string().uuid('Invalid document id'),
  tabId: z.string().uuid('Invalid tab id'),
})

const tabTitleSchema = z.string().trim().min(1, 'A tab needs a title').max(120, 'Tab titles are 120 characters at most')

/** A tab's page numbering; null continues the previous tab's numbers. */
export const tabNumberingSchema = z.object({
  format: z.enum(['none', 'roman', 'arabic']),
  restart: z.boolean(),
  start: z.number().int().min(1).max(100000),
  hideFirst: z.boolean(),
})

/** A tab's headings and captions with the page (within the tab) each is on. */
const tabOutlineSchema = z
  .array(
    z.object({
      kind: z.enum(['heading', 'figure', 'table']).optional(),
      level: z.number().int().min(0).max(6),
      text: z.string().max(400),
      page: z.number().int().min(0).max(100000),
    }),
  )
  .max(3000)

/** Save one tab's body (the editor sends only the open tab). */
export const saveTabSchema = z.object({
  content: z.string().max(8000000, 'Content is too large'),
  content_json: editorJsonSchema.nullable().optional(),
  page_count: z.number().int().min(0).max(100000).optional(),
  caption_counts: z.record(z.unknown()).nullable().optional(),
  outline: tabOutlineSchema.nullable().optional(),
})

/** Split a document: its body with a tab marker before each tab. */
export const splitTabsSchema = z.object({
  content: z.string().max(8000000, 'Content is too large'),
  content_json: editorJsonSchema.nullable().optional(),
})

export const addTabSchema = z.object({
  title: tabTitleSchema,
  afterTabId: z.string().uuid().optional(),
})

export const updateTabSchema = z
  .object({
    title: tabTitleSchema.optional(),
    position: z.number().int().min(0).max(1000).optional(),
    numbering: tabNumberingSchema.nullable().optional(),
    // How many pages the tab took when the editor last laid it out (where later tabs' pages start).
    page_count: z.number().int().min(0).max(100000).optional(),
    // Set when a split lays out every tab at once (later saves keep them up to date).
    outline: tabOutlineSchema.nullable().optional(),
    caption_counts: z.record(z.unknown()).nullable().optional(),
  })
  .refine((data) => data.title !== undefined || data.position !== undefined || data.numbering !== undefined || data.page_count !== undefined || data.outline !== undefined || data.caption_counts !== undefined, {
    message: 'At least one field must be provided',
  })

export type SaveTabInput = z.infer<typeof saveTabSchema>
export type SplitTabsInput = z.infer<typeof splitTabsSchema>
export type AddTabInput = z.infer<typeof addTabSchema>
export type UpdateTabInput = z.infer<typeof updateTabSchema>

/** A named version saved now ("Before the assistant: page setup"); for a tabbed document, the open tab. */
export const versionCheckpointSchema = z.object({
  reason: z.string().trim().min(3).max(200),
  tabId: z.string().uuid().optional(),
})
