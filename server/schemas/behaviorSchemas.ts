import { z } from 'zod'

/** Validate behavior events received from external clients before ingestion. */
export const behaviorEventSchema = z.object({
  action: z.string().trim().min(1, 'Action is required'),
  timestamp: z.string().datetime('Timestamp must be a valid ISO datetime'),
  documentId: z.string().trim().min(1, 'Document ID is required'),
})

/** Infer the runtime-validated behavior event type from the schema. */
export type BehaviorEventInput = z.infer<typeof behaviorEventSchema>