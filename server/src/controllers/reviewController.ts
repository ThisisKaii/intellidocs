import { Request, Response } from 'express'
import * as reviewModel from '../models/reviewModel'

/** Save a tester's review (text plus up to 5 screenshots) for the signed-in user. */
export async function submitReview(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const review = await reviewModel.createReview(
      userId,
      req.body.message,
      req.body.pagePath,
      req.get('user-agent'),
      files,
    )
    res.status(201).json({ id: review.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit review'
    res.status(500).json({ error: message })
  }
}
