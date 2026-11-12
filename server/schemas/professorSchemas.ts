import { z } from 'zod'

export const addCommentSchema = z.object({
  documentId: z.string().uuid(),
  highlightedText: z.string().optional(),
  comment: z.string().min(1, 'Comment cannot be empty'),
})

/**
 * Rubric scores keyed by criterion id. The controller checks them against the class rubric
 * (every criterion scored, none above its points); 0-100 is only the outer bound.
 */
export const rubricSchema = z
  .record(z.string().trim().min(1).max(40), z.number().min(0).max(100))
  .refine((scores) => Object.keys(scores).length >= 1 && Object.keys(scores).length <= 12, {
    message: 'A rubric has 1 to 12 criteria',
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

const criterionSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, 'Criterion ids use lowercase letters, digits and dashes'),
  name: z.string().trim().min(1, 'Every criterion needs a name').max(60, 'Criterion names are 60 characters or fewer'),
  description: z.string().trim().max(200, 'Descriptions are 200 characters or fewer').default(''),
  maxPoints: z.number().int('Points are whole numbers').min(1, 'Every criterion is worth at least 1 point').max(100),
})

/** A class rubric: 1 to 12 criteria with distinct ids whose points add up to 100. */
export const classRubricSchema = z
  .object({ criteria: z.array(criterionSchema).min(1, 'Add at least one criterion').max(12, 'A rubric has at most 12 criteria') })
  .refine((rubric) => new Set(rubric.criteria.map((c) => c.id)).size === rubric.criteria.length, {
    message: 'Two criteria share an id',
    path: ['criteria'],
  })
  .refine((rubric) => rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0) === 100, {
    message: "The criteria's points must add up to 100",
    path: ['criteria'],
  })

export type ClassRubricInput = z.infer<typeof classRubricSchema>
