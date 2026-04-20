import { Router } from 'express'
import {
  predictFormatting,
  grammarCheck,
  spellingCheck,
} from '../controllers/predictionController'

const router = Router()

router.post('/predict', predictFormatting)
router.post('/grammar-check', grammarCheck)
router.post('/spelling-check', spellingCheck)

export default router
