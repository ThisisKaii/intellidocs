import { z } from 'zod'

/**
 * Behavior payload captured at format-apply time (feeds cross-document learning).
 *
 * The structured-object fields (table shape, image dimensions, alignment, block
 * type) must be declared here explicitly: Zod strips unknown keys, so any field
 * missing from this object is silently dropped before the event reaches the
 * model and Redis.
 */
const behaviorPayloadSchema = z.object({
  text: z.string().optional(),
  format: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  fontSize: z.number().int().positive().nullable().optional(),
  textAlign: z.string().optional(),
  // Table shape at the moment of the action.
  tableRows: z.number().int().nonnegative().optional(),
  tableCols: z.number().int().nonnegative().optional(),
  tableAlignment: z.enum(['left', 'center', 'right']).optional(),
  tableHasHeader: z.boolean().optional(),
  // Image dimensions in CSS pixels.
  imageWidth: z.number().nonnegative().optional(),
  imageHeight: z.number().nonnegative().optional(),
  imageAlignment: z.enum(['left', 'center', 'right', 'float']).optional(),
  imageHasCaption: z.boolean().optional(),
  // Callout / blockquote / code block.
  blockType: z.string().max(50).optional(),
  blockIndent: z.number().int().nonnegative().optional(),
  codeLanguage: z.string().max(50).optional(),
  contextNode: z.string().max(50).optional(),
})

/** Validate behavior events received from external clients before ingestion. */
export const behaviorEventSchema = z.object({
  action: z.string().trim().min(1, 'Action is required'),
  timestamp: z.string().datetime('Timestamp must be a valid ISO datetime'),
  documentId: z.string().trim().min(1, 'Document ID is required'),
  blockId: z.string().optional(),
  payload: behaviorPayloadSchema.optional(),
})

/** Infer the runtime-validated behavior event type from the schema. */
export type BehaviorEventInput = z.infer<typeof behaviorEventSchema>