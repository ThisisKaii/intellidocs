import { z } from 'zod'

/** Validate incoming text payloads for prediction-related HTTP routes. */
export const predictionTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Text is required')
    .max(50000, 'Text is too long'),
})

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
  type: z.string().min(1),
})

/** Validate spelling-check responses returned by the Python service. */
export const pythonSpellingCheckResponseSchema = z.object({
  issues: z.array(pythonSpellingIssueSchema),
  count: z.number().int().min(0),
  message: z.string().min(1),
})

/** Validate formatting prediction responses returned by the Python service. */
export const pythonPredictionResponseSchema = z.object({
  predicted_format: z.string().min(1),
  confidence: z.number().min(0).max(1),
  feature_values: z.record(z.number()).default({}),
})

export type PredictionTextInput = z.infer<typeof predictionTextSchema>
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