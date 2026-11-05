import { Router } from 'express'
import {
  predictFormatting,
  grammarCheck,
  spellingCheck,
} from '../controllers/predictionController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { grammarCheckSchema, predictFormatRequestSchema } from '../../schemas/predictionSchemas'

const router = Router()

router.post('/predict', aiArcjet, validateBody(predictFormatRequestSchema), predictFormatting)
router.post('/grammar-check', aiArcjet, validateBody(grammarCheckSchema), grammarCheck)
router.post('/spelling-check', aiArcjet, validateBody(grammarCheckSchema), spellingCheck)

export default router
