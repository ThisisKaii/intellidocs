import { Router } from 'express'
import {
  predictFormatting,
  grammarCheck,
  spellingCheck,
} from '../controllers/predictionController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { predictionTextSchema } from '../../schemas/predictionSchemas'

const router = Router()

router.post('/predict', aiArcjet, validateBody(predictionTextSchema), predictFormatting)
router.post('/grammar-check', aiArcjet, validateBody(predictionTextSchema), grammarCheck)
router.post('/spelling-check', aiArcjet, validateBody(predictionTextSchema), spellingCheck)

export default router
