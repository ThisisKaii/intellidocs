import { Router } from 'express'
import {
  grammarCheck,
  predictFormatting,
  spellingCheck,
} from '../controllers/predictionController'
import { chatWithAI, logAIFeedback, triggerUserFineTune } from '../controllers/aiController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { predictionTextSchema } from '../../schemas/predictionSchemas'
import { aiChatRequestSchema } from '../../schemas/aiSchemas'
import { logFeedbackSchema } from '../../schemas/feedbackSchemas'

const router = Router()

router.post(
  '/predict',
  aiArcjet,
  validateBody(predictionTextSchema),
  predictFormatting
)

router.post(
  '/grammar-check',
  aiArcjet,
  validateBody(predictionTextSchema),
  grammarCheck
)

router.post(
  '/spelling-check',
  aiArcjet,
  validateBody(predictionTextSchema),
  spellingCheck
)

router.post(
  '/chat',
  aiArcjet,
  validateBody(aiChatRequestSchema),
  chatWithAI
)

router.post(
  '/feedback',
  aiArcjet,
  validateBody(logFeedbackSchema),
  logAIFeedback
)

router.post(
  '/fine-tune',
  aiArcjet,
  triggerUserFineTune
)

export default router
