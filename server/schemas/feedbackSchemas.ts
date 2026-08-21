import { z } from 'zod'

/** Validate incoming AI feedback requests from HTTP clients. */
export const logFeedbackSchema = z.object({
  documentId: z
    .string()
    .trim()
    .uuid('Invalid document ID format')
    .optional(),
  predictionType: z.enum(['format_prompt', 'suggestion_panel', 'chat_preview'], {
    required_error: 'Prediction type is required',
  }),
  predictedFormat: z
    .string()
    .trim()
    .min(1, 'Predicted format is required')
    .max(80, 'Predicted format is too long'),
  confidence: z
    .number()
    .min(0, 'Confidence cannot be negative')
    .max(100, 'Confidence cannot exceed 100')
    .optional(),
  accepted: z.boolean({
    required_error: 'Accepted status is required',
  }),
})

export type LogFeedbackInput = z.infer<typeof logFeedbackSchema>
