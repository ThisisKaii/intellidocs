import { z } from 'zod'

export const addCommentSchema = z.object({
  documentId: z.string().uuid(),
  highlightedText: z.string().optional(),
  comment: z.string().min(1, 'Comment cannot be empty'),
})

export const submitGradeSchema = z.object({
  documentId: z.string().uuid(),
  studentId: z.string().uuid(),
  grade: z.number().min(0).max(100),
  notes: z.string().optional(),
})

export type AddCommentInput = z.infer<typeof addCommentSchema>
export type SubmitGradeInput = z.infer<typeof submitGradeSchema>
