import { z } from 'zod'
import { triggerConditionSchema } from './formattingSchemas'

/** Export scope: which parts of the personalization profile to bundle. */
export const profileScopeSchema = z.enum(['formatting', 'grammar', 'both'])
export type ProfileScope = z.infer<typeof profileScopeSchema>

/** A portable format binding stripped of ownership/timestamps. */
export const portableBindingSchema = z.object({
  trigger_condition: triggerConditionSchema,
  format_to_apply: z
    .string()
    .trim()
    .min(1, 'format_to_apply is required')
    .max(50),
  priority: z.number().int().min(0).default(0),
})

/** Validate a parsed .idocprofile bundle before merging it into a user profile. */
export const profileImportSchema = z.object({
  version: z.string().trim().min(1).max(20),
  creator_email: z.string().email().optional(),
  exported_at: z.string().optional(),
  scope: profileScopeSchema,
  formatting: z
    .object({
      custom_bindings: z.array(portableBindingSchema).default([]),
    })
    .default({}),
  grammar_spelling: z
    .object({
      custom_dictionary: z.array(z.string().trim().min(1).max(100)).default([]),
      ignored_patterns: z.array(z.string().trim().min(1).max(100)).default([]),
    })
    .default({}),
})

export type ProfileImportInput = z.infer<typeof profileImportSchema>
export type PortableBinding = z.infer<typeof portableBindingSchema>