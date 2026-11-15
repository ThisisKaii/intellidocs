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

/** Validate the document-structure inference request body. */
export const inferStructureSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(10000),
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

/** One heading level's look in a preset read from a file. */
export const blueprintHeadingSchema = z.object({
  textAlign: z.enum(['left', 'center', 'right']),
  fontSize: z.string().regex(/^\d{1,2}(?:\.\d)?pt$/),
  fontWeight: z.union([z.literal(400), z.literal(700)]),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textTransform: z.enum(['uppercase', 'capitalize', 'none']),
})

/**
 * A preset's blueprint, read from a document the user uploaded: page, body text and heading
 * looks, and the section headings the document is built from. Shared as a .idocpreset file.
 */
export const presetBlueprintSchema = z.object({
  version: z.literal(1),
  pageSize: z.enum(['short', 'long', 'a4', 'letter', 'legal']),
  orientation: z.enum(['portrait', 'landscape']),
  margins: z.object({
    top: z.number().min(0).max(4),
    bottom: z.number().min(0).max(4),
    left: z.number().min(0).max(4),
    right: z.number().min(0).max(4),
  }),
  fontFamily: z.string().trim().min(1).max(120).regex(/^[\w\s'",.-]+$/, 'Unsupported font name'),
  baseFontSize: z.string().regex(/^\d{1,2}(?:\.\d)?pt$/),
  lineHeight: z.number().min(0.8).max(3.5),
  firstLineIndent: z.string().regex(/^\d(?:\.\d{1,2})?in$/),
  bodyAlign: z.enum(['left', 'center', 'right', 'justify']),
  headings: z.object({
    level1: blueprintHeadingSchema,
    level2: blueprintHeadingSchema,
    level3: blueprintHeadingSchema,
  }),
  pageNumbers: z.enum(['none', 'number', 'roman', 'manuscript']).optional(),
  /** Section headings in order (CHAPTER I, INTRODUCTION, …): the outline new documents start from. */
  sections: z.array(z.object({ level: z.number().int().min(1).max(3), text: z.string().trim().min(1).max(160) })).max(80),
})

/** A shared .idocpreset file being added to the current user's presets. */
export const importUserPresetSchema = z.object({
  format: z.literal('intellidocs-preset'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  baseKey: z.string().trim().min(1).max(100),
  blueprint: presetBlueprintSchema,
})

export type PresetBlueprint = z.infer<typeof presetBlueprintSchema>
export type ImportUserPresetInput = z.infer<typeof importUserPresetSchema>
export type CreateFormatBindingInput = z.infer<typeof createFormatBindingSchema>
export type UpdateFormatBindingInput = z.infer<typeof updateFormatBindingSchema>
export type TierCheckInput = z.infer<typeof tierCheckSchema>
export type SetDocumentPresetInput = z.infer<typeof setDocumentPresetSchema>
export type CreateUserPresetInput = z.infer<typeof createUserPresetSchema>
