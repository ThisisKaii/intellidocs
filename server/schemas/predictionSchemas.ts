import { z } from 'zod'
import { pageNumberFormatSchema, pageLayoutBaseSchema } from './documentSchemas'

/** Validate incoming text payloads for prediction-related HTTP routes. */
export const predictionTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Text is required')
    .max(50000, 'Text is too long'),
  /** Isolation mode for research comparisons: baseline/isolated/hybrid. */
  isolationMode: z.enum(['baseline', 'isolated', 'hybrid']).optional(),
})

/** One editor text block sent to the grammar and spelling checkers. */
export const textBlockSchema = z.object({
  text: z.string().max(50000),
  kind: z.enum(['paragraph', 'heading', 'listItem']).default('paragraph'),
  align: z.string().max(20).default('left'),
  centered: z.boolean().default(false),
})

/**
 * Validate grammar/spell payloads: per-block text with layout metadata, or the
 * older plain string. At least one non-empty source is required.
 */
export const grammarCheckSchema = z
  .object({
    text: z.string().trim().max(50000, 'Text is too long').optional(),
    blocks: z.array(textBlockSchema).max(5000).optional(),
  })
  .refine(
    (body) =>
      Boolean(body.text) ||
      (body.blocks ?? []).some((block) => block.text.trim().length > 0),
    { message: 'Text is required' }
  )
  .refine(
    (body) =>
      (body.blocks ?? []).reduce((sum, block) => sum + block.text.length, 0) <= 50000,
    { message: 'Text is too long' }
  )

/** Validate structured grammar issues returned by the Python service. */
export const pythonGrammarIssueSchema = z.object({
  type: z.string().min(1),
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string(),
})

/** Validate grammar-check responses returned by the Python service. */
export const pythonGrammarCheckResponseSchema = z.object({
  score: z.number().min(0).max(1),
  status: z.string().min(1),
  message: z.string().min(1),
  issues: z.array(pythonGrammarIssueSchema),
})

/** Validate spelling issues returned by the Python service. */
export const pythonSpellingIssueSchema = z.object({
  word: z.string().min(1),
  suggestion: z.string().nullable(),
  suggestions: z.array(z.string()).optional(),
  type: z.string().min(1),
})

/** Validate spelling-check responses returned by the Python service. */
export const pythonSpellingCheckResponseSchema = z.object({
  issues: z.array(pythonSpellingIssueSchema),
  count: z.number().int().min(0),
  message: z.string().min(1),
})

/** Formatting labels in the ML taxonomy (11 total after the 8 → 11 expansion). */
export const formatLabelSchema = z.enum([
  'title',
  'heading1',
  'heading2',
  'heading3',
  'paragraph',
  'blockquote',
  'caption',
  'ordered_list',
  'unordered_list',
  'code_block',
  'reference_entry',
])

/** Validate formatting prediction responses returned by the Python service. */
export const pythonPredictionResponseSchema = z.object({
  predicted_format: formatLabelSchema,
  confidence: z.number().min(0).max(1),
  feature_values: z.record(z.number()).default({}),
  isolation_mode: z.enum(['baseline', 'isolated', 'hybrid']).optional(),
})

/** Validate page setup returned by the Python document converter. */
export const pythonPageSetupSchema = z.object({
  page_size: z.enum(['short', 'long', 'a4', 'letter', 'legal']),
  orientation: z.enum(['portrait', 'landscape']),
  margins: z.object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
  }),
})

/** Validate document-conversion responses returned by the Python service. */
export const pythonConversionResponseSchema = z.object({
  html: z.string().min(1),
  page_setup: pythonPageSetupSchema,
  header: z.string(),
  footer: z.string(),
  /** Page-number format read from a PAGE field in the header/footer (absent from older ML builds). */
  header_number_format: pageNumberFormatSchema.optional(),
  footer_number_format: pageNumberFormatSchema.optional(),
  /** Page furniture beyond text (absent from older ML builds). */
  hf: z
    .object({
      sections: pageLayoutBaseSchema.shape.sections,
      parts: pageLayoutBaseSchema.shape.parts,
    })
    .optional(),
  page_art: z
    .object({
      repeat: z.string(),
      pages: z.record(z.string(), z.string()),
      overlays: pageLayoutBaseSchema.shape.overlays,
    })
    .optional(),
})

export type PredictionTextInput = z.infer<typeof predictionTextSchema>
export type TextBlock = z.infer<typeof textBlockSchema>
export type GrammarCheckInput = z.infer<typeof grammarCheckSchema>
export type FormatLabel = z.infer<typeof formatLabelSchema>
export type PythonGrammarIssue = z.infer<typeof pythonGrammarIssueSchema>
export type PythonGrammarCheckResponse = z.infer<
  typeof pythonGrammarCheckResponseSchema
>
export type PythonSpellingIssue = z.infer<typeof pythonSpellingIssueSchema>
export type PythonSpellingCheckResponse = z.infer<
  typeof pythonSpellingCheckResponseSchema
>
export type PythonPredictionResponse = z.infer<
  typeof pythonPredictionResponseSchema
>
export type PythonConversionResponse = z.infer<
  typeof pythonConversionResponseSchema
>