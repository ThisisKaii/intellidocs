import { Router } from 'express'
import multer from 'multer'
import * as reviewController from '../controllers/reviewController'
import { validateBody } from '../middleware/validate'
import { submitReviewSchema } from '../../schemas/reviewSchemas'

const router = Router()

/** Memory storage; up to 5 screenshots of 10 MB each, image types only. */
const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Image type not allowed: ${file.mimetype}`))
    }
  },
})

router.post('/', reviewUpload.array('images', 5), validateBody(submitReviewSchema), reviewController.submitReview)

export default router
