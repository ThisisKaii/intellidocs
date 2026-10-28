import { Router } from 'express'
import * as reviewController from '../controllers/reviewController'
import { localOnly } from '../middleware/localOnly'

const router = Router()

// Local development only: no login, so the guard must stay on every route here.
router.get('/', localOnly, reviewController.listReviews)

export default router
