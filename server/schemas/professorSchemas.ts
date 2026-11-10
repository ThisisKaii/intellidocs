import { z } from 'zod'

export const addCommentSchema = z.object({
  documentId: z.string().uuid(),
  highlightedText: z.string().optional(),
  comment: z.string().min(1, 'Comment cannot be empty'),
})

const criterion = z.number().min(0).max(25)

/** Four criteria, 0-25 each; their sum is the overall grade. */
export const rubricSchema = z.object({
  content: criterion,
  methodology: criterion,
  formatting: criterion,
  mechanics: criterion,
})

export const submitGradeSchema = z.object({
  documentId: z.string().uuid(),
  studentId: z.string().uuid(),
  grade: z.number().min(0).max(100),
  notes: z.string().max(5000).optional(),
  rubric: rubricSchema.optional(),
})

export type AddCommentInput = z.infer<typeof addCommentSchema>
export type SubmitGradeInput = z.infer<typeof submitGradeSchema>
export type RubricInput = z.infer<typeof rubricSchema>
