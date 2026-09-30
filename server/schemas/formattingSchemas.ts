import { z } from 'zod'

/** Validate a single trigger condition (jsonb) for a binding or preset rule. */
export const triggerConditionSchema = z.object({
  maxWords: z.number().int().min(0).optional(),
  minWords: z.number().int().min(0).optional(),
  maxChars: z.number().int().min(0).optional(),
  standaloneLine: z.boolean().optional(),
  startsWith: z.string().max(200).optional(),
  contains: z.string().max(200).optional(),
})

/** Validate a custom format binding (Tier 2) on create. */
export const createFormatBindingSchema = z.object({
  trigger_condition: triggerConditionSchema,
  format_to_apply: z
    .string()
    .trim()
    .min(1, 'format_to_apply is required')
    .max(50),
  priority: z.number().int().min(0).default(0),
})

/** Validate a custom format binding on update (partial allowed). */
export const updateFormatBindingSchema = createFormatBindingSchema.partial()

/** Validate the three-tier check request body. */
export const tierCheckSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(50000),
  documentId: z.string().trim().min(1, 'documentId is required'),
})

/** Validate the body when assigning a preset to a document. */
export const setDocumentPresetSchema = z.object({
  preset: z.string().trim().max(100),
})

/** A single formatting rule inside a forked blueprint. */
export const formatRuleSchema = z.object({
  condition: triggerConditionSchema.optional(),
  format: z.string().trim().min(1).max(50),
  priority: z.number().int().min(0).optional(),
})

/** Validate a request that forks a standard blueprint into a personal preset. */
export const createUserPresetSchema = z.object({
  baseKey: z.string().trim().min(1, 'Base preset key is required').max(100),
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(400).optional(),
  rules: z.array(formatRuleSchema).max(200).optional(),
})

export type CreateFormatBindingInput = z.infer<typeof createFormatBindingSchema>
export type UpdateFormatBindingInput = z.infer<typeof updateFormatBindingSchema>
export type TierCheckInput = z.infer<typeof tierCheckSchema>
export type SetDocumentPresetInput = z.infer<typeof setDocumentPresetSchema>
export type CreateUserPresetInput = z.infer<typeof createUserPresetSchema>
