import { z } from 'zod'

/** Behavior payload captured at format-apply time (feeds cross-document learning). */
const behaviorPayloadSchema = z.object({
  text: z.string().optional(),
  format: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  fontSize: z.number().int().positive().nullable().optional(),
  textAlign: z.string().optional(),
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