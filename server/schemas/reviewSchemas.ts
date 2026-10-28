import { z } from 'zod'

export const submitReviewSchema = z.object({
  message: z.string().trim().min(1, 'Review cannot be empty').max(5000, 'Review is too long'),
  pagePath: z.string().max(500).optional(),
})

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>
